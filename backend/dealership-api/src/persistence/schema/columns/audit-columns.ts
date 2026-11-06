import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, uuid } from "drizzle-orm/pg-core";
import { instant } from "./temporal-columns";

/**
 * The columns every business table has (docs/standards/database.md): who created and last changed the row and when,
 * and a soft delete. A function, because a column definition belongs to one table.
 */
export function auditColumns() {
  return {
    createdAt: instant().notNull(),
    createdBy: uuid().notNull(),
    updatedAt: instant().notNull(),
    updatedBy: uuid().notNull(),
    isDeleted: boolean().notNull().default(false),
    deletedAt: instant(),
    deletedBy: uuid(),
  };
}

/** A deleted row records when and by whom; a live row has neither. */
export function softDeleteCheck(
  table: string,
  columns: { isDeleted: AnyPgColumn; deletedAt: AnyPgColumn; deletedBy: AnyPgColumn },
) {
  return check(
    `ck_${table}_deleted`,
    sql`${columns.isDeleted} = (${columns.deletedAt} IS NOT NULL) AND ${columns.isDeleted} = (${columns.deletedBy} IS NOT NULL)`,
  );
}
