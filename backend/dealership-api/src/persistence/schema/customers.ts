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
    // A city filter (ACME-117): the location, the city as "equals" compares it (lower case), then the list's name order
    // and the id, so a city few customers have is found without reading the location's whole index, its page comes
    // in order and its count from the index alone.
    index("ix_customers_by_city")
      .on(table.dealerId, table.locationId, sql`lower(${table.city})`, table.surname, table.firstName, table.id)
      .where(sql`${table.isDeleted} = false`),
    // The search box (a match anywhere in the name, company or email): trigrams find the few matching rows among
    // millions; an ordinary index cannot serve `ilike '%…%'`. It needs pg_trgm, and three letters or more. The location
    // first (btree_gin): the index gives only that location's matches, where without it a common name brought every
    // location's to be read and thrown away ("ackroyd" at Northside: 3,442 of 11,868, ACME-129).
    index("ix_customers_search_location")
      .using("gin", table.locationId, sql`(${customerSearchText(table)}) gin_trgm_ops`)
      .where(sql`${table.isDeleted} = false`),
    // The search box before ACME-129, with the phone in it: the version before this one still searches through it
    // while a deploy rolls out. Dropped in the release after (docs/standards/database.md, "Expand, then contract").
    index("ix_customers_search")
      .using("gin", sql`(${legacyCustomerSearchText(table)}) gin_trgm_ops`)
      .where(sql`${table.isDeleted} = false`),
    // A phone by the start or the end of its digits (ACME-129): `like '0300%'` on the digits, or on them reversed for
    // the last digits, each a range of one index. `text_pattern_ops` lets a b-tree serve `like 'prefix%'`.
    index("ix_customers_phone_start")
      .on(table.dealerId, table.locationId, sql`(${phoneDigits(table.phone)}) text_pattern_ops`)
      .where(sql`${table.isDeleted} = false`),
    index("ix_customers_phone_end")
      .on(table.dealerId, table.locationId, sql`(reverse(${phoneDigits(table.phone)})) text_pattern_ops`)
      .where(sql`${table.isDeleted} = false`),
    // A close spelling's customers (ACME-120, 129): everyone with that surname, or that first name, case ignored, in
    // the list's name order, read straight from the index instead of a substring search of the location.
    index("ix_customers_surname_ci")
      .on(table.dealerId, table.locationId, sql`lower(${table.surname})`, table.surname, table.firstName, table.id)
      .where(sql`${table.isDeleted} = false`),
    index("ix_customers_first_name_ci")
      .on(table.dealerId, table.locationId, sql`lower(${table.firstName})`, table.surname, table.firstName, table.id)
      .where(sql`${table.isDeleted} = false`),
    // One index for each sort the grid offers that the list indexes do not (ACME-129): a keyset page, the last page
    // too, reads its 25 ids from the index, either way, whatever the location's size.
    ...(["companyName", "email", "phone", "city", "status"] as const).map((column) =>
      index(`ix_customers_sort_${snakeCaseOf(column)}`)
        .on(table.dealerId, table.locationId, table[column], table.id)
        .where(sql`${table.isDeleted} = false`),
    ),
    softDeleteCheck("customers", table),
  ],
);

/**
 * The text the customer search looks in: name, company and email, a unit separator (chr 31) between them so a search
 * never matches across two fields. The search and its index use this one expression, so they cannot drift. The phone
 * is searched by its digits instead (`phoneDigits`, ACME-129).
 */
export function customerSearchText(columns: {
  firstName: AnyPgColumn;
  surname: AnyPgColumn;
  companyName: AnyPgColumn;
  email: AnyPgColumn;
}): SQL {
  return sql`${columns.firstName} || chr(31) || ${columns.surname} || chr(31) || coalesce(${columns.companyName}, '') || chr(31) || coalesce(${columns.email}, '')`;
}

/** Before ACME-129: the search text with the phone. Only for `ix_customers_search`'s declaration, until it is dropped. */
function legacyCustomerSearchText(columns: {
  firstName: AnyPgColumn;
  surname: AnyPgColumn;
  companyName: AnyPgColumn;
  email: AnyPgColumn;
  phone: AnyPgColumn;
}): SQL {
  return sql`${customerSearchText(columns)} || chr(31) || coalesce(${columns.phone}, '')`;
}

/**
 * A phone's digits alone: "+44 (0)113 496-0000" is 4401134960000. What the phone search compares, and what its two
 * indexes hold, so they cannot drift.
 */
export function phoneDigits(phone: AnyPgColumn): SQL {
  return sql`regexp_replace(coalesce(${phone}, ''), '[^0-9]', '', 'g')`;
}

function snakeCaseOf(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
