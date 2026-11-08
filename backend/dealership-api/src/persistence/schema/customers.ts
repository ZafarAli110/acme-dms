import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, index, integer, snakeCase, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, softDeleteCheck } from "./columns/audit-columns";
import { plainDate } from "./columns/temporal-columns";

export type CustomerStatus = "active" | "prospect" | "inactive";

/** A customer of one rooftop of a dealer: each rooftop keeps its own customer book. */
export const customers = snakeCase.table(
  "customers",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    dealerId: uuid().notNull(),
    locationId: uuid().notNull(),
    firstName: varchar({ length: 100 }).notNull(),
    surname: varchar({ length: 100 }).notNull(),
    companyName: varchar({ length: 200 }),
    email: varchar({ length: 254 }),
    phone: varchar({ length: 40 }),
    city: varchar({ length: 100 }),
    status: varchar({ length: 20 }).$type<CustomerStatus>().notNull(),
    lastContactDate: plainDate(),
    /**
     * Goes up by one with every change. It is the record's ETag: a save says which version it started from
     * (If-Match), and one that started from an older version is refused (412) instead of undoing someone's change.
     */
    version: integer().notNull().default(1),
    ...auditColumns(),
  },
  (table) => [
    // The list's two orders (ACME-110), each read straight from an index: a page stops after its 25 rows instead of
    // sorting the whole location. Each starts with what row-level security compares (dealer, location: only live
    // rows), then the order, then the id; the columns after the id are there so the page's ids, the count and a
    // filter on status, city or the other order are answered from the index alone, without reading the table.
    index("ix_customers_list_by_name")
      .on(
        table.dealerId,
        table.locationId,
        table.surname,
        table.firstName,
        table.id,
        table.status,
        table.city,
        table.lastContactDate,
      )
      .where(sql`${table.isDeleted} = false`),
    index("ix_customers_list_by_last_contact")
      .on(
        table.dealerId,
        table.locationId,
        table.lastContactDate,
        table.id,
        table.status,
        table.city,
        table.surname,
        table.firstName,
      )
      .where(sql`${table.isDeleted} = false`),
    // The search box (a match anywhere in the name, company, email or phone): trigrams find the few matching rows
    // among millions; an ordinary index cannot serve `ilike '%…%'`. It needs pg_trgm, and three letters or more.
    index("ix_customers_search")
      .using("gin", sql`(${customerSearchText(table)}) gin_trgm_ops`)
      .where(sql`${table.isDeleted} = false`),
    softDeleteCheck("customers", table),
  ],
);

/**
 * The text the customer search looks in: name, company, email and phone, a unit separator (chr 31) between them so a
 * search never matches across two fields. The search and its index use this one expression, so they cannot drift.
 */
export function customerSearchText(columns: {
  firstName: AnyPgColumn;
  surname: AnyPgColumn;
  companyName: AnyPgColumn;
  email: AnyPgColumn;
  phone: AnyPgColumn;
}): SQL {
  return sql`${columns.firstName} || chr(31) || ${columns.surname} || chr(31) || coalesce(${columns.companyName}, '') || chr(31) || coalesce(${columns.email}, '') || chr(31) || coalesce(${columns.phone}, '')`;
}

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
