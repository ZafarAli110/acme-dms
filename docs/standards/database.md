# Database

Each service owns one Postgres database (identity, dealership, documents); no service reads another's tables. These
rules apply to every table in all three.

## Tables and columns

- Table and column names are `snake_case`, tables plural (`part_photos`). Keys are `uuid` named `id`; a reference to
  another row is `<thing>_id`.
- **The database generates ids**: `id uuid DEFAULT uuidv7()` (PostgreSQL 18). UUID v7 sorts by creation time, which
  keeps the index compact. Code never makes up an id: it saves the row and reads the id back. NestJS: the schema's
  ``uuid('id').primaryKey().default(sql`uuidv7()`)`` and `insert(…).returning()`; .NET: `UuidV7Keys`, applied in
  `OnModelCreating`. When something must carry the new id in the same transaction (an outbox message), save, then
  write it, then commit (`IUnitOfWork.ExecuteInTransactionAsync`).
- Every business row has `dealer_id`, and location-owned rows also have `location_id` (`standards/multi-tenancy.md`).
  Many dealers share the dealership database.
- A moment is `timestamptz` (UTC); a calendar day with no time is `date` (`standards/coding-standards.md`, "Time").
- Money is `numeric(12,2)`, never a float.

## Audit columns: every business table

| Column       | Type          | Set                                                      |
| ------------ | ------------- | -------------------------------------------------------- |
| `created_at` | `timestamptz` | when the row was added                                   |
| `created_by` | `uuid`        | who added it                                             |
| `updated_at` | `timestamptz` | when it last changed (the same as `created_at` at first) |
| `updated_by` | `uuid`        | who changed it last                                      |
| `is_deleted` | `boolean`     | `false` until the row is deleted                         |
| `deleted_at` | `timestamptz` | when it was deleted; null while it is not                |
| `deleted_by` | `uuid`        | who deleted it; null while it is not                     |

A check constraint (`ck_<table>_deleted`) keeps the three delete columns consistent.

- **"Who" is a user id**: the signed-in user, or `00000000-0000-0000-0000-000000000000` (the system) for work no user
  does: seeding, processing document events.
- **Technical tables are exempt** and keep their own timestamp: `processed_messages`, `outbox_messages`,
  `document_contents` (part of its document), `signing_keys`.
- **NestJS**: every table spreads `auditColumns()` (`persistence/schema/columns/audit-columns.ts`); handlers fill the columns
  with `createdAudit(userId, now)` / `updatedAudit(userId, now)` from `business-logic/audit/audit-fields.ts`, with the
  time from the injected clock.
- **.NET**: entities extend `AuditedEntity` (`Persistence/Auditing/`); `AuditingInterceptor` fills the columns on every
  save from `TimeProvider` and `ICurrentActor`. Handlers never set them.

## Soft delete

Business rows are never removed; a delete sets `is_deleted`, `deleted_at` and `deleted_by` (and `updated_*`).

- **Reads leave deleted rows out by themselves**: in NestJS a restrictive row-level-security policy
  (`<table>_not_deleted`, migration 0007) hides them from every query and join of a request; in EF Core the global
  query filter does it. A handler writes no `notDeleted`, and marks a row deleted with `softDeleteAsync`
  (`business-logic/audit/soft-delete.ts`), the one place that lifts the policy for that statement and sets the audit
  columns. Code that works outside a request (NestJS worker and consumer, the owner role) or lifts the filters on
  purpose (.NET background work uses `IgnoreQueryFilters()`) checks deleted rows itself:
  `notDeleted(table)` (`persistence/schema/soft-delete/not-deleted.ts`). A new soft-deleted table needs its policy; a
  test fails until it has one.
- **In .NET, `Remove()` is a soft delete**: the interceptor turns it into an update. Rows that belong to a deleted row
  and are not audited (a document's `document_contents`) are removed with it, so stored files do not outlive their
  record.
- **Unique rules ignore deleted rows**: a unique index has `WHERE NOT is_deleted`, so a deleted part number, bin code
  or email can be used again. Check uniqueness in code with the same filtered query.

## Migrations

- NestJS: the schema is TypeScript (`persistence/schema/`, one file per table, Drizzle). Change it, then generate the
  SQL migration from the difference with `bun run db:generate` (in `backend/dealership-api`); read the SQL before
  committing it. A column is written by its property (`dealerId: uuid().notNull()` is the column `dealer_id`): the
  clients and `drizzle.config.ts` set `casing: "snake_case"`, so no name is repeated. A unique constraint on a column
  is named (`.unique("part_photos_document_id_unique")`), because Drizzle does not apply the casing to that name. Migrations live in `persistence/migrations/drizzle/`. .NET: EF Core migrations in the Persistence
  project (`dotnet ef migrations add <Name>`). Every service applies its migrations when it starts;
  `bun run db:migrate` applies dealership-api's without starting it.
- A migration that adds a `NOT NULL` column to a table with data backfills it from data the row already has (see
  .NET's `AuditColumns` migration), and has a working `down`.
- Never edit a migration that has run anywhere else; add a new one.
