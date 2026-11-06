import { sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { customers } from "#persistence/schema/index";
import type { XlsxCellKind } from "../../../exports/xlsx/xlsx-workbook-writer";

/**
 * A field the customer list can put in a file: what it reads, its heading when the request names none, how the cell
 * is typed, and how wide it is.
 */
export interface CustomerExportColumn {
  source: PgColumn | SQL;
  header: string;
  kind: XlsxCellKind;
  width: number;
}

/**
 * The customer list's fields as file columns, by the grid's field names. The name reads as the grid shows it
 * ("Amara Okafor"); the list sorts by surname.
 */
export const CUSTOMER_EXPORT_COLUMNS: Readonly<Record<string, CustomerExportColumn>> = {
  name: {
    source: sql<string>`${customers.firstName} || ' ' || ${customers.surname}`,
    header: "Name",
    kind: "text",
    width: 28,
  },
  companyName: { source: customers.companyName, header: "Company", kind: "text", width: 26 },
  email: { source: customers.email, header: "Email", kind: "text", width: 30 },
  phone: { source: customers.phone, header: "Phone", kind: "text", width: 18 },
  city: { source: customers.city, header: "City", kind: "text", width: 16 },
  status: { source: customers.status, header: "Status", kind: "text", width: 11 },
  lastContactDate: { source: customers.lastContactDate, header: "Last contact", kind: "date", width: 14 },
};
