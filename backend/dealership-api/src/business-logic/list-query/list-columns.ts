import {BadRequestException} from '@nestjs/common';
import {and, asc, desc, eq, gt, gte, ilike, isNotNull, isNull, lt, lte, ne, or, sql, type SQL} from 'drizzle-orm';
import type {PgColumn} from 'drizzle-orm/pg-core';
import {FILTER_OPERATORS, type ListQueryDto} from '#dto/paging/list-query.dto';

export type ListColumnType = keyof typeof FILTER_OPERATORS;

/** A field a list can be sorted and filtered by: what it reads in SQL, and its type (which decides the operators). */
export interface ListColumn {
  source: PgColumn | SQL;
  type: ListColumnType;
}

/** A list's sortable and filterable fields, by the names the web app's grid uses. */
export type ListColumns = Readonly<Record<string, ListColumn>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function columnFor(columns: ListColumns, field: string, use: string): ListColumn {
  const column = columns[field];
  if (!column) {
    throw new BadRequestException(
      `This list cannot be ${use} "${field}". It can be by: ${Object.keys(columns).join(', ')}.`,
    );
  }
  return column;
}

/** Escapes LIKE's wildcards, so a filter for "50%" matches the text "50%" and not everything after "50". */
function likePattern(value: string, before: string, after: string): string {
  return `${before}${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}${after}`;
}

function valueFor(column: ListColumn, operator: string, value: string | undefined): string | number {
  if (!value) {
    throw new BadRequestException(`The filter "${operator}" needs a value.`);
  }
  if (column.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new BadRequestException(`"${value}" is not a number.`);
    }
    return number;
  }
  if (column.type === 'date' && !ISO_DATE.test(value)) {
    throw new BadRequestException(`"${value}" is not a date (YYYY-MM-DD).`);
  }
  return value;
}

/**
 * The query's sort first, then `tieBreakers` (which end with the id, so equal values keep one order from page to
 * page). Without a sort, the list's own order (`defaults`).
 */
export function listOrderBy(columns: ListColumns, query: ListQueryDto, defaults: SQL[], tieBreakers: SQL[]): SQL[] {
  if (!query.sort) {
    return [...defaults, ...tieBreakers];
  }
  const source = sql`${columnFor(columns, query.sort, 'sorted by').source}`;
  return [query.direction === 'desc' ? desc(source) : asc(source), ...tieBreakers];
}

/** The query's one filter as a condition, or undefined when it has none. */
export function listFilter(columns: ListColumns, query: ListQueryDto): SQL | undefined {
  if (!query.filterField || !query.filterOperator) {
    return undefined;
  }
  const column = columnFor(columns, query.filterField, 'filtered by');
  const operator = query.filterOperator;
  if (!(FILTER_OPERATORS[column.type] as readonly string[]).includes(operator)) {
    throw new BadRequestException(
      `"${query.filterField}" cannot be filtered with "${operator}". It can with: ${FILTER_OPERATORS[column.type].join(', ')}.`,
    );
  }
  // As an expression: a column or a computed value alike. Postgres types each parameter from what it is compared with.
  const source = sql`${column.source}`;
  if (operator === 'isEmpty') {
    return column.type === 'text' ? or(isNull(source), eq(source, '')) : isNull(source);
  }
  if (operator === 'isNotEmpty') {
    return column.type === 'text' ? and(isNotNull(source), ne(source, '')) : isNotNull(source);
  }
  const value = valueFor(column, operator, query.filterValue);
  switch (operator) {
    case 'contains':
      return ilike(source, likePattern(String(value), '%', '%'));
    case 'startsWith':
      return ilike(source, likePattern(String(value), '', '%'));
    case 'endsWith':
      return ilike(source, likePattern(String(value), '%', ''));
    case 'equals':
      return ilike(source, likePattern(String(value), '', ''));
    case '=':
    case 'is':
      return eq(source, value);
    case '!=':
    case 'not':
      return ne(source, value);
    case '>':
    case 'after':
      return gt(source, value);
    case '>=':
    case 'onOrAfter':
      return gte(source, value);
    case '<':
    case 'before':
      return lt(source, value);
    default:
      return lte(source, value);
  }
}
