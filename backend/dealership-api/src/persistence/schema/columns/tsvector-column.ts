import { customType } from "drizzle-orm/pg-core";

/**
 * Postgres's `tsvector`: a text's words as full-text search keeps them (each word's base form and its positions). Read
 * as Postgres writes it (`'brake':1 'front':4 'pad':2`); searched in SQL with `@@`, never in TypeScript.
 */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});
