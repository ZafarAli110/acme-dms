import {eq, type SQL} from 'drizzle-orm';
import type {AnyPgColumn} from 'drizzle-orm/pg-core';

/**
 * The condition every read of a business table includes: rows are never removed, a deleted row is only marked
 * (`is_deleted`), and it is left out of everything the service returns.
 */
export function notDeleted(table: {isDeleted: AnyPgColumn}): SQL {
  return eq(table.isDeleted, false);
}
