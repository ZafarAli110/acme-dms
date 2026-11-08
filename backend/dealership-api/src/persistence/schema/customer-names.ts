import { sql } from "drizzle-orm";
import { index, integer, snakeCase, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/** The kinds of name a customer gives the list: a first name, a surname, each word of a company name. */
export type CustomerNameKind = "first" | "surname" | "company_word";

/**
 * Each location's names, with how many live customers have each (ACME-120): what "Did you mean" compares a search
 * with, a few hundred to a few thousand names a location instead of its millions of customers. A technical table
 * (docs/standards/database.md): derived from `customers` and kept in step by triggers on it in the same transaction
 * (the `customer_names` migration), so it has no audit columns and no soft delete, and a name nobody has any more is
 * removed. Location-scoped, with its policy, like `customers`.
 */
export const customerNames = snakeCase.table(
  "customer_names",
  {
    dealerId: uuid().notNull(),
    locationId: uuid().notNull(),
    kind: varchar({ length: 20 }).$type<CustomerNameKind>().notNull(),
    name: varchar({ length: 200 }).notNull(),
    customers: integer().notNull(),
  },
  (table) => [
    // One row a name, whatever its case; the triggers add to it and take away from it.
    uniqueIndex("uq_customer_names_location_kind_name").on(table.locationId, table.kind, sql`lower(${table.name})`),
    // Close spellings: `lower(name) % word` finds candidates by trigrams.
    index("ix_customer_names_trigrams").using("gin", sql`lower(${table.name}) gin_trgm_ops`),
  ],
);
