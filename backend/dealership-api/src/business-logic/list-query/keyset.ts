import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { asc, desc, is, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { localized } from "#i18n/messages";
import { type ListColumns, columnFor } from "./list-columns";

/**
 * Keyset paging (ACME-129): a page is "the rows after this one", found from the last row's own values, so page 40,000
 * costs what page 1 costs. Offset paging (`pageOffset`) reads and drops every row before the page, and stays for a jump
 * to a page by its number, up to row 10,000.
 *
 * A list's order is its keys (the sort's columns, or the list's own order), then the id, all one way: the id takes the
 * sort's direction (`listOrderBy`), so one index read forwards or backwards serves the page.
 */
export interface SortSpec {
  keys: readonly SortKey[];
  id: PgColumn;
  descending: boolean;
}

interface SortKey {
  source: PgColumn | SQL;
  /** Can be empty: Postgres puts nulls last going up and first going down, and a row comparison skips them. */
  nullable: boolean;
}

/** One row of a page, as keyset paging needs it: its id, and its keys as Postgres prints them. */
export interface KeyedRow {
  id: string;
  keys: (string | null)[];
}

/**
 * What a cursor holds: the row a page starts after (or before), and how the list's first page found its rows, when that
 * was a choice: a search's matches through the trigram index ("few") or by walking the sort's index ("dense"). Later
 * pages take the same way without asking again (ACME-129).
 */
export interface CursorRow {
  keys: (string | null)[];
  id: string;
  path: SearchPath | null;
}

export type SearchPath = "few" | "dense";

/** Which page: after a row (next), before a row (previous), or the list's last page. */
export type KeysetMove = { after: string } | { before: string } | { last: true };

/** A list query's keyset move, or null for a page by its number. */
export function keysetMoveOf(query: ListQueryDto): KeysetMove | null {
  if (query.after) {
    return { after: query.after };
  }
  if (query.before) {
    return { before: query.before };
  }
  return query.last ? { last: true } : null;
}

/**
 * The list's sort as keyset paging reads it: the query's sort column (or `defaults` when it has none), then the id.
 * At most one key may be nullable, and only alone: a page of such a sort is two runs of the index (`segments`).
 */
export function sortSpecOf(
  columns: ListColumns,
  query: ListQueryDto,
  defaults: readonly PgColumn[],
  id: PgColumn,
): SortSpec {
  const sources = query.sort
    ? (() => {
        const column = columnFor(columns, query.sort, "errors.listCannotSortBy");
        return column.sortBy ?? [column.source];
      })()
    : defaults;
  const keys = sources.map((source) => ({ source, nullable: !(is(source, PgColumn) && source.notNull) }));
  if (keys.some((key) => key.nullable) && keys.length > 1) {
    throw new Error("A keyset sort with a nullable key must have that key alone.");
  }
  return { keys, id, descending: Boolean(query.sort) && query.direction === "desc" };
}

/** What a page's id query selects: the id, and each key as text (a cursor carries them back as they were). */
export function keyedFields(spec: SortSpec): Record<string, SQL> {
  const fields: Record<string, SQL> = { id: sql<string>`${spec.id}::text` };
  spec.keys.forEach((key, index) => {
    fields[`k${index}`] = sql<string | null>`(${key.source})::text`;
  });
  return fields;
}

/** A selected row (`keyedFields`) as a `KeyedRow`. */
export function keyedRowOf(spec: SortSpec, row: Record<string, unknown>): KeyedRow {
  return {
    id: String(row["id"]),
    keys: spec.keys.map((_, index) => {
      const value = row[`k${index}`];
      return value === null || value === undefined ? null : String(value);
    }),
  };
}

/** One run of an index: its condition and its order. */
export interface Segment {
  where: SQL | undefined;
  orderBy: SQL[];
}

/**
 * The runs that make up the rows after `from` in `spec`'s order (or before it, `reversed`), in turn: a page reads the
 * first, and the next while it is short.
 *
 * Without a nullable key: one run, `(k…, id) > (v…, vid)`, a range of the list's index. With one (a company, an email,
 * a last contact date): going up, the filled rows then the empty ones; going down, the other way round. Each run is a
 * range of the column's index (`col is not null and (col, id) > (v, vid)`, then `col is null and id > vid`): an `or`
 * between them would make Postgres read the location from its start.
 */
export function segments(spec: SortSpec, from: CursorRow | null, reversed: boolean): Segment[] {
  const descending = spec.descending !== reversed;
  const beyond = descending ? "<" : ">";
  const direction = (source: PgColumn | SQL): SQL => (descending ? desc(sql`${source}`) : asc(sql`${source}`));
  const rowAfter = (sources: (PgColumn | SQL)[], values: (string | null)[]): SQL =>
    sql`(${sql.join(
      sources.map((source) => sql`${source}`),
      sql`, `,
    )}) ${sql.raw(beyond)} (${sql.join(
      values.map((value) => sql`${value}`),
      sql`, `,
    )})`;

  const [key] = spec.keys;
  if (!key?.nullable) {
    return [
      {
        where: from ? rowAfter([...spec.keys.map((each) => each.source), spec.id], [...from.keys, from.id]) : undefined,
        orderBy: [...spec.keys.map((each) => direction(each.source)), direction(spec.id)],
      },
    ];
  }

  const filled: Segment = {
    where: sql`${isNotNull(sql`${key.source}`)}${
      from && from.keys[0] !== null
        ? sql` and ${rowAfter([key.source, spec.id], [from.keys[0] ?? null, from.id])}`
        : sql``
    }`,
    orderBy: [direction(key.source), direction(spec.id)],
  };
  const empty: Segment = {
    where: sql`${isNull(sql`${key.source}`)}${
      from && from.keys[0] === null ? sql` and ${rowAfter([spec.id], [from.id])}` : sql``
    }`,
    // By the column too, though every value here is empty: Postgres does not count `is null` as fixing the column, so
    // ordered by the id alone it would sort the location's empty rows instead of reading them in the index's order.
    orderBy: [direction(key.source), direction(spec.id)],
  };
  // Nulls come last going up and first going down; a cursor in the later run skips the earlier one.
  const runs = descending ? [empty, filled] : [filled, empty];
  if (!from) {
    return runs;
  }
  const inEmpty = from.keys[0] === null;
  const startsInFirst = descending ? inEmpty : !inEmpty;
  return startsInFirst ? runs : runs.slice(1);
}

/** A page found by keyset: its rows in the list's order, and the rows its next and previous cursors start from. */
export interface KeysetPage {
  rows: KeyedRow[];
  next: KeyedRow | null;
  previous: KeyedRow | null;
}

/**
 * Reads the page `move` asks for, running each segment through `read` (the list's own query: its tables, its scope,
 * its filter) until the page is full, with one row more to know whether another page follows.
 */
export async function readKeysetPageAsync(
  spec: SortSpec,
  move: KeysetMove,
  from: CursorRow | null,
  pageSize: number,
  read: (segment: Segment, limit: number) => Promise<KeyedRow[]>,
): Promise<KeysetPage> {
  const reversed = !("after" in move);
  const found: KeyedRow[] = [];
  for (const segment of segments(spec, from, reversed)) {
    if (found.length > pageSize) {
      break;
    }
    found.push(...(await read(segment, pageSize + 1 - found.length)));
  }
  const more = found.length > pageSize;
  const page = found.slice(0, pageSize);
  if (!reversed) {
    return { rows: page, next: more ? (page.at(-1) ?? null) : null, previous: page[0] ?? null };
  }
  // Read backwards from the cursor (or from the end): put the rows back in the list's order.
  const rows = page.toReversed();
  return {
    rows,
    next: "last" in move ? null : (rows.at(-1) ?? null),
    previous: more ? (rows[0] ?? null) : null,
  };
}

/**
 * Cursors are signed (HMAC, the export links' key, shared by every API instance) and tied to their question: the
 * dealer, the location, the search, the sort and the filter. One from another question, or changed by hand, is a 400.
 */
export class CursorCodec {
  private readonly _key: string;
  private readonly _question: string;

  public constructor(key: string, scope: { dealerId: string; locationId: string }, query: ListQueryDto) {
    this._key = key;
    this._question = createHash("sha256")
      .update(
        JSON.stringify([
          scope.dealerId,
          scope.locationId,
          query.search ?? null,
          query.sort ?? null,
          query.direction ?? null,
          query.filterField ?? null,
          query.filterOperator ?? null,
          query.filterValue ?? null,
        ]),
      )
      .digest("base64url");
  }

  public encode(row: KeyedRow, path: SearchPath | null = null): string {
    const payload = Buffer.from(JSON.stringify({ k: row.keys, i: row.id, p: path })).toString("base64url");
    return `${payload}.${this.signature(payload)}`;
  }

  public decode(token: string): CursorRow {
    const [payload, given, ...rest] = token.split(".");
    if (!payload || !given || rest.length > 0) {
      throw invalidCursor();
    }
    const expected = Buffer.from(this.signature(payload));
    const actual = Buffer.from(given);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw invalidCursor();
    }
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isCursorShape(parsed)) {
      throw invalidCursor();
    }
    return { keys: parsed.k, id: parsed.i, path: parsed.p ?? null };
  }

  private signature(payload: string): string {
    return createHmac("sha256", this._key).update(`${this._question}.${payload}`).digest("base64url");
  }
}

function isCursorShape(value: unknown): value is { k: (string | null)[]; i: string; p?: SearchPath | null } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { k, i, p } = value as { k?: unknown; i?: unknown; p?: unknown };
  return (
    typeof i === "string" &&
    Array.isArray(k) &&
    k.every((each) => each === null || typeof each === "string") &&
    (p === undefined || p === null || p === "few" || p === "dense")
  );
}

function invalidCursor(): BadRequestException {
  return new BadRequestException(localized("errors.listCursorInvalid"));
}
