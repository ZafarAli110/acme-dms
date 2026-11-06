import { sql } from "drizzle-orm";
import { index, integer, snakeCase, uuid, varchar } from "drizzle-orm/pg-core";
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
    index("ix_customers_location").on(table.locationId),
    // The list's own order (by name, then id) read straight from the index: a page stops after its 25 rows instead of
    // sorting the whole location. At 1.6 million customers, page 1 went from 391 ms to 0.3 ms.
    index("ix_customers_location_name")
      .on(table.locationId, table.surname, table.firstName, table.id)
      .where(sql`${table.isDeleted} = false`),
    softDeleteCheck("customers", table),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
