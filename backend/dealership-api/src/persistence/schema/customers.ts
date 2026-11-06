import { sql } from "drizzle-orm";
import { index, integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, softDeleteCheck } from "./columns/audit-columns";
import { plainDate } from "./columns/temporal-columns";

export type CustomerStatus = "active" | "prospect" | "inactive";

/** A customer of one rooftop of a dealer: each rooftop keeps its own customer book. */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    dealerId: uuid("dealer_id").notNull(),
    locationId: uuid("location_id").notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    surname: varchar("surname", { length: 100 }).notNull(),
    companyName: varchar("company_name", { length: 200 }),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 40 }),
    city: varchar("city", { length: 100 }),
    status: varchar("status", { length: 20 }).$type<CustomerStatus>().notNull(),
    lastContactDate: plainDate("last_contact_date"),
    /**
     * Goes up by one with every change. It is the record's ETag: a save says which version it started from
     * (If-Match), and one that started from an older version is refused (412) instead of undoing someone's change.
     */
    version: integer("version").notNull().default(1),
    ...auditColumns(),
  },
  (table) => [index("ix_customers_location").on(table.locationId), softDeleteCheck("customers", table)],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
