import { BadRequestException } from "@nestjs/common";
import { and, not, or, type SQL, sql } from "drizzle-orm";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { localized } from "#i18n/messages";
import { customers } from "#persistence/schema/customers";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import {
  type CursorRow,
  type KeyedRow,
  type KeysetMove,
  type KeysetPage,
  segments,
  type SortSpec,
} from "../../../list-query/keyset";

/** A search shorter than this stays exact: too few letters to compare spellings (ACME-120), or to rank by. */
export const MIN_CLOSE_LETTERS = 3;
/**
 * Only a word of letters (a name may have ' and -) is compared with names: anything with @, a dot, a digit or a space
 * is part of an email or a phone, or several words, and stays exact as today (Zafar Ali, 8 Nov).
 */
export const NAME_WORD = /^[\p{L}'-]+$/u;

/** The two groups of a best-first search, as a cursor's first key carries them. */
const EXACT = "0";
const OTHERS = "1";

/**
 * The word a search ranks by, or null (ACME-129, Zafar Ali, 9 Nov): a search of one name word, in the list's own order
 * (no column sort chosen). Its customers whose surname or first name is the word come first, in name order, then every
 * other match in name order. A common surname has about 1,900 customers at Northside and 8,400 matches in all (6,500
 * work for a company of that name): sorting them all for a page took 9–17 ms; the exact names come straight from the
 * name indexes in their order (0.1 ms).
 */
export function bestFirstWord(query: ListQueryDto): string | null {
  const word = (query.search ?? "").trim().toLowerCase();
  if (query.sort || word.length < MIN_CLOSE_LETTERS || !NAME_WORD.test(word)) {
    return null;
  }
  return word;
}

/** Whether a customer's surname or first name is the word, case ignored. */
export function isExactName(word: string): SQL {
  return or(sql`lower(${customers.surname}) = ${word}`, sql`lower(${customers.firstName}) = ${word}`) as SQL;
}

/** The list's order for a best-first search, before its name order: the exact names first. The export sorts by it. */
export function exactNamesFirst(word: string): SQL {
  return sql`case when ${isExactName(word)} then 0 else 1 end`;
}

/** What a best-first page is read from. */
export interface BestFirstSearch {
  word: string;
  /** The dealer, the location, live rows and the query's filter, written out: these reads are the table owner's. */
  scope: SQL | undefined;
  /** The rest of the search's matches, read as the list reads a search (its path), the exact names left out. */
  readOthersAsync: (from: CursorRow | null, reversed: boolean, limit: number, offset: number) => Promise<KeyedRow[]>;
}

/** The search's matches that are not exact names: the search's own condition, the exact names left out. */
export function othersOf(word: string, where: SQL | undefined): SQL | undefined {
  return and(where, not(isExactName(word)));
}

/**
 * One best-first page, by keyset (`move`) or by its number (`page`). Its rows carry their group as their first key, so
 * a cursor knows which side of the boundary it stands on; their other keys are the name order's (`spec`).
 */
export async function readBestFirstPageAsync(
  db: Database,
  search: BestFirstSearch,
  spec: SortSpec,
  asked: { move: KeysetMove | null; cursor: CursorRow | null; page: number; offset: number; pageSize: number },
): Promise<KeysetPage> {
  const { move, cursor, pageSize } = asked;
  const want = pageSize + 1;
  const exact = (from: CursorRow | null, reversed: boolean, limit: number, offset = 0) =>
    readExactAsync(db, search, spec, from, reversed, limit, offset);
  const others = async (from: CursorRow | null, reversed: boolean, limit: number, offset = 0) =>
    (await search.readOthersAsync(from, reversed, limit, offset)).map((row) => grouped(OTHERS, row));

  if (!move) {
    // By number: the exact names fill the pages they reach, the others the rest (counted only past page 1).
    const exactCount = asked.offset === 0 ? Number.POSITIVE_INFINITY : await countExactAsync(db, search);
    const found = asked.offset < exactCount ? await exact(null, false, want, asked.offset) : [];
    if (found.length < want) {
      const othersOffset = asked.offset < exactCount ? 0 : asked.offset - exactCount;
      found.push(...(await others(null, false, want - found.length, othersOffset)));
    }
    const rows = found.slice(0, pageSize);
    return {
      rows,
      next: found.length > pageSize ? (rows.at(-1) ?? null) : null,
      previous: asked.page > 1 ? (rows[0] ?? null) : null,
    };
  }

  const group = cursor ? groupOf(cursor) : null;
  const from = cursor ? ungrouped(cursor) : null;
  const found: KeyedRow[] = [];
  if ("after" in move) {
    if (group === EXACT) {
      found.push(...(await exact(from, false, want)));
    }
    if (found.length < want) {
      found.push(...(await others(group === OTHERS ? from : null, false, want - found.length)));
    }
  } else {
    // Backwards (before a cursor, or from the end): the others first, then the exact names.
    if (group !== EXACT) {
      found.push(...(await others(group === OTHERS ? from : null, true, want)));
    }
    if (found.length < want) {
      found.push(...(await exact(group === EXACT ? from : null, true, want - found.length)));
    }
  }
  const more = found.length > pageSize;
  const page = found.slice(0, pageSize);
  if ("after" in move) {
    return { rows: page, next: more ? (page.at(-1) ?? null) : null, previous: page[0] ?? null };
  }
  const rows = page.toReversed();
  return { rows, next: "last" in move ? null : (rows.at(-1) ?? null), previous: more ? (rows[0] ?? null) : null };
}

/**
 * The exact names after (or before) `from`, in name order: the surname matches and the first-name matches, each read
 * from its own index in its order (`ix_customers_surname_ci`, `ix_customers_first_name_ci`) and merged. One condition
 * with `or` made Postgres walk the whole name index instead (240 ms for "moore").
 */
async function readExactAsync(
  db: Database,
  search: BestFirstSearch,
  spec: SortSpec,
  from: CursorRow | null,
  reversed: boolean,
  limit: number,
  offset: number,
): Promise<KeyedRow[]> {
  const [run] = segments(spec, from, reversed);
  const take = limit + offset;
  const member = (name: SQL) => sql`(select ${customers.id} as id, ${customers.surname} as surname,
      ${customers.firstName} as first_name from ${customers}
    where ${and(search.scope, name, run?.where)}
    order by ${sql.join(run?.orderBy ?? [], sql`, `)} limit ${take})`;
  const direction = sql.raw(reversed ? "desc" : "asc");
  const result = await db.execute<{ id: string; surname: string; first_name: string }>(sql`
    select id::text as id, surname::text as surname, first_name::text as first_name
    from (${member(sql`lower(${customers.surname}) = ${search.word}`)}
          union
          ${member(sql`lower(${customers.firstName}) = ${search.word}`)}) as exact_names
    order by surname ${direction}, first_name ${direction}, id ${direction}
    offset ${offset} limit ${limit}`);
  return result.rows.map((row) => ({ id: row.id, keys: [EXACT, row.surname, row.first_name] }));
}

/** How many exact names there are: where a page by number crosses into the others. */
async function countExactAsync(db: Database, search: BestFirstSearch): Promise<number> {
  const result = await db.execute<{ total: number }>(sql`
    select count(*)::int as total from (
      select ${customers.id} from ${customers} where ${and(search.scope, sql`lower(${customers.surname}) = ${search.word}`)}
      union
      select ${customers.id} from ${customers} where ${and(search.scope, sql`lower(${customers.firstName}) = ${search.word}`)}
    ) as exact_names`);
  return result.rows[0]?.total ?? 0;
}

function grouped(group: string, row: KeyedRow): KeyedRow {
  return { id: row.id, keys: [group, ...row.keys] };
}

/** A best-first cursor's group; anything else is not one of this search's cursors. */
function groupOf(cursor: CursorRow): string {
  const [group] = cursor.keys;
  if (cursor.keys.length < 2 || (group !== EXACT && group !== OTHERS)) {
    throw new BadRequestException(localized("errors.listCursorInvalid"));
  }
  return group;
}

function ungrouped(cursor: CursorRow): CursorRow {
  return { ...cursor, keys: cursor.keys.slice(1) };
}
