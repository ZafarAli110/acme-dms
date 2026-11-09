import { localized } from "#i18n/messages";
import { BadRequestException } from "@nestjs/common";
import { and, asc, desc, eq, gt, gte, ilike, is, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";
import { FILTER_OPERATORS, type ListQueryDto } from "#dto/paging/list-query.dto";
import { phoneDigits } from "#persistence/schema/customers";

export type ListColumnType = keyof typeof FILTER_OPERATORS;

/** A field a list can be sorted and filtered by: what it reads in SQL, and its type (which decides the operators). */
export interface ListColumn {
  source: PgColumn | SQL;
  type: ListColumnType;
  /**
   * What a sort on this field orders by, when that is not `source`: "Surname, First name" is filtered as one text but
   * sorted by its columns, which an index can serve; ordering by the joined text sorts every row of the location.
   */
  sortBy?: readonly (PgColumn | SQL)[];
}

/** A list's sortable and filterable fields, by the names the web app's grid uses. */
export type ListColumns = Readonly<Record<string, ListColumn>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The text operators `listFilter` turns into `ILIKE`. */
const TEXT_MATCHES: readonly string[] = ["contains", "equals", "startsWith", "endsWith"];

/**
 * Whether the query's filter matches text with `ILIKE`. `ILIKE` is not leakproof, so under row-level security Postgres
 * applies the policy before it and no index can serve it; a list that must stay quick finds such a filter's ids as the
 * table's owner, with the scope written out (docs/standards/multi-tenancy.md). `=`, `<` and `>` on a status or a date
 * are leakproof and stay under the policy.
 */
export function matchesText(columns: ListColumns, query: ListQueryDto): boolean {
  const column = query.filterField ? columns[query.filterField] : undefined;
  return (column?.type === "text" || column?.type === "phone") && TEXT_MATCHES.includes(query.filterOperator ?? "");
}

/**
 * The digits typed for a phone, when the text is one: digits, spaces, dashes, dots, brackets and "+" only ("0113 496",
 * "+44 (0)7700", "4417"). Anything else (a letter, an @) is a name, a company or an email.
 */
export function phoneDigitsTyped(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  return /^[\d\s().+-]+$/.test(text) && digits.length > 0 ? digits : null;
}

/**
 * A phone by its digits (ACME-129): starting with them (`ix_customers_phone_start`), ending with them (the digits
 * reversed, `ix_customers_phone_end`), or all of them. Each a range of a b-tree; the middle of a number is not searched.
 */
export function phoneMatching(phone: PgColumn, digits: string, how: "start" | "end" | "startOrEnd" | "all"): SQL {
  const all = phoneDigits(phone);
  const reversed = [...digits].toReversed().join("");
  const start = sql`${all} like ${`${digits}%`}`;
  const end = sql`reverse(${all}) like ${`${reversed}%`}`;
  switch (how) {
    case "start":
      return start;
    case "end":
      return end;
    case "all":
      return sql`${all} = ${digits}`;
    default:
      return sql`(${start} or ${end})`;
  }
}

export function columnFor(
  columns: ListColumns,
  field: string,
  refusal: "errors.listCannotSortBy" | "errors.listCannotFilterBy",
): ListColumn {
  const column = columns[field];
  if (!column) {
    throw new BadRequestException(localized(refusal, { field, fields: Object.keys(columns).join(", ") }));
  }
  return column;
}

/** Escapes LIKE's wildcards, so a filter for "50%" matches the text "50%" and not everything after "50". */
function likePattern(value: string, before: string, after: string): string {
  return `${before}${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}${after}`;
}

function valueFor(column: ListColumn, operator: string, value: string | undefined): string | number {
  if (!value) {
    throw new BadRequestException(localized("errors.filterNeedsValue", { operator }));
  }
  if (column.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new BadRequestException(localized("errors.notANumber", { value }));
    }
    return number;
  }
  if (column.type === "date" && !ISO_DATE.test(value)) {
    throw new BadRequestException(localized("errors.notADate", { value }));
  }
  return value;
}

/**
 * The query's sort first, then `tieBreakers` (which end with the id, so equal values keep one order from page to
 * page). Without a sort, the list's own order (`defaults`), the tie-breakers ascending.
 *
 * The tie-breakers take the sort's direction (ACME-129): newest first breaks a tie by the newest id first. Each list
 * index ends with the id, so one index read forwards or backwards serves both directions, and a keyset page compares
 * one row of values. Ascending first, they made every descending sort read the whole tie and sort it again (80 ms at
 * Northside, where 149,452 customers share the latest contact date). Nulls stay where Postgres puts them: last going
 * up, first going down.
 */
export function listOrderBy(
  columns: ListColumns,
  query: ListQueryDto,
  defaults: SQL[],
  tieBreakers: readonly PgColumn[],
): SQL[] {
  if (!query.sort) {
    return [...defaults, ...tieBreakers.map((column) => asc(column))];
  }
  const column = columnFor(columns, query.sort, "errors.listCannotSortBy");
  const descending = query.direction === "desc";
  const sorted = (column.sortBy ?? [column.source]).map((source) =>
    descending ? desc(sql`${source}`) : asc(sql`${source}`),
  );
  return [...sorted, ...tieBreakers.map((tie) => (descending ? desc(tie) : asc(tie)))];
}

/** The query's one filter as a condition, or undefined when it has none. */
export function listFilter(columns: ListColumns, query: ListQueryDto): SQL | undefined {
  if (!query.filterField || !query.filterOperator) {
    return undefined;
  }
  const column = columnFor(columns, query.filterField, "errors.listCannotFilterBy");
  const operator = query.filterOperator;
  if (!(FILTER_OPERATORS[column.type] as readonly string[]).includes(operator)) {
    throw new BadRequestException(
      localized("errors.filterOperatorNotAllowed", {
        field: query.filterField,
        operator,
        operators: FILTER_OPERATORS[column.type].join(", "),
      }),
    );
  }
  // As an expression: a column or a computed value alike. Postgres types each parameter from what it is compared with.
  const source = sql`${column.source}`;
  const texty = column.type === "text" || column.type === "phone";
  if (operator === "isEmpty") {
    return texty ? or(isNull(source), eq(source, "")) : isNull(source);
  }
  if (operator === "isNotEmpty") {
    return texty ? and(isNotNull(source), ne(source, "")) : isNotNull(source);
  }
  const value = valueFor(column, operator, query.filterValue);
  if (column.type === "phone") {
    const digits = phoneDigitsTyped(String(value));
    if (!digits || !is(column.source, PgColumn)) {
      throw new BadRequestException(localized("errors.notAPhone", { value: String(value) }));
    }
    return phoneMatching(
      column.source,
      digits,
      operator === "startsWith" ? "start" : operator === "endsWith" ? "end" : "all",
    );
  }
  switch (operator) {
    case "contains":
      return ilike(source, likePattern(String(value), "%", "%"));
    case "startsWith":
      return ilike(source, likePattern(String(value), "", "%"));
    case "endsWith":
      return ilike(source, likePattern(String(value), "%", ""));
    case "equals":
      // Exact with the case ignored, as ILIKE without wildcards was; in this form an index on lower(column) can serve
      // it (the city's, ACME-117). Both sides folded by Postgres, as ILIKE folds them.
      return sql`lower(${source}) = lower(${String(value)})`;
    case "=":
    case "is":
      return eq(source, value);
    case "!=":
    case "not":
      return ne(source, value);
    case ">":
    case "after":
      return gt(source, value);
    case ">=":
    case "onOrAfter":
      return gte(source, value);
    case "<":
    case "before":
      return lt(source, value);
    default:
      return lte(source, value);
  }
}
