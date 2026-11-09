import { and, eq, inArray, sql } from "drizzle-orm";
import { type CustomerNameKind, customerNames } from "#persistence/schema/customer-names";
import type { Database } from "#persistence/unit-of-work/unit-of-work";

/** How far a close name may be from the word searched: two letters missing, extra, changed or swapped. */
const MAX_DISTANCE = 2;
/** At most this many close names are tried, closest first. */
const MAX_NAMES = 10;
/** Candidates Postgres gives for ranking here: more than are tried, so the ranking can reorder them. */
const CANDIDATES = 30;
/** How alike a name must be by trigrams to be close, whatever its edits: pg_trgm's default for `%`. */
const MIN_LIKENESS = 0.3;
/**
 * From this length on, every name at most `MAX_DISTANCE` edits away shares a trigram with the word: the word has
 * length + 1 trigrams and one edit changes at most 3, so 7 or more cannot all go. The trigram index then finds every
 * candidate; a shorter word compares every name of the location.
 */
const MIN_INDEXED_LENGTH = 6;
const KINDS: CustomerNameKind[] = ["first", "surname", "company_word"];

/** Whose names: the location's. The lookups below run as the table's owner, so it is written out. */
export interface NameScope {
  dealerId: string;
  locationId: string;
}

/** A name the location has, close to the word searched, how many edits away, and what kinds of name it is. */
export interface CloseName {
  name: string;
  distance: number;
  kinds: CustomerNameKind[];
}

/**
 * Whether the location has this word as a name: a known name is a correct spelling, and keeps today's list (ACME-120,
 * Zafar Ali, 8 Nov). `db` works as the table's owner, with the dealer and location written out: under the policy
 * `lower(name)` is not leakproof, so no index could serve it and every name of the location was read (5 ms at
 * Northside); with the kinds named, the unique index finds it (0.1 ms, ACME-129).
 */
export async function isKnownNameAsync(db: Database, scope: NameScope, word: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql`1` })
    .from(customerNames)
    .where(
      and(
        eq(customerNames.dealerId, scope.dealerId),
        eq(customerNames.locationId, scope.locationId),
        inArray(customerNames.kind, KINDS),
        sql`lower(${customerNames.name}) = ${word}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * The location's names close to the word: trigram neighbours or at most two edits away, whatever kind (first name,
 * surname, company word), the word itself left out. Postgres gives the candidates; they are ranked here by an edit
 * distance that counts two neighbouring letters swapped as one edit ("hpoper" is 1 from Hopper, 2 from Harper; plain
 * levenshtein makes both 2), then by trigram similarity. Sound-alike codes would miss "pnewood" (it sounds like
 * "Newood").
 *
 * `db` works as the table's owner, with the dealer and location written out: under the policy neither `%` nor
 * levenshtein is leakproof, so every name of the location was compared (12 ms at Northside's 5,329). As the owner, a
 * word of `MIN_INDEXED_LENGTH` letters or more takes its candidates from the trigram index, every name sharing a
 * trigram with it (the threshold set just above none), and only they are compared (0.3 ms, ACME-129). `set local` ends
 * with the read-only transaction.
 */
export async function closeNamesAsync(db: Database, scope: NameScope, word: string): Promise<CloseName[]> {
  const name = sql`lower(${customerNames.name})`;
  const indexed = word.length >= MIN_INDEXED_LENGTH;
  if (indexed) {
    await db.execute(sql`select set_config('pg_trgm.similarity_threshold', '0.001', true)`);
  }
  const result = await db.execute<{ name: string; likeness: number; kinds: CustomerNameKind[] }>(sql`
    select min(${customerNames.name}) as name, max(similarity(${name}, ${word})) as likeness,
           array_agg(distinct ${customerNames.kind}) as kinds
    from ${customerNames}
    where ${customerNames.dealerId} = ${scope.dealerId} and ${customerNames.locationId} = ${scope.locationId}
      and ${indexed ? sql`${name} % ${word}` : sql`true`}
      and (similarity(${name}, ${word}) >= ${MIN_LIKENESS}
           or levenshtein_less_equal(${name}, ${word}, ${MAX_DISTANCE}) <= ${MAX_DISTANCE})
      and ${name} <> ${word}
    group by ${name}
    order by min(levenshtein(${name}, ${word})), likeness desc
    limit ${CANDIDATES}`);
  return result.rows
    .map((row) => ({
      name: row.name,
      distance: editDistance(row.name.toLowerCase(), word),
      likeness: Number(row.likeness),
      kinds: row.kinds,
    }))
    .filter((candidate) => candidate.distance <= MAX_DISTANCE || candidate.likeness >= MIN_LIKENESS)
    .toSorted((a, b) => a.distance - b.distance || b.likeness - a.likeness)
    .slice(0, MAX_NAMES)
    .map(({ name: closeName, distance, kinds }) => ({ name: closeName, distance, kinds }));
}

/**
 * Edits from one word to another, a swap of two neighbouring letters counting as one (optimal string alignment): how
 * people mistype a name they heard ("pnewood" for Penwood, 1).
 */
export function editDistance(from: string, to: string): number {
  const rows = Array.from({ length: from.length + 1 }, (_row, i) =>
    Array.from({ length: to.length + 1 }, (_column, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number): number => rows[i]?.[j] ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i <= from.length; i++) {
    for (let j = 1; j <= to.length; j++) {
      const same = from[i - 1] === to[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + same);
      if (i > 1 && j > 1 && from[i - 1] === to[j - 2] && from[i - 2] === to[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      const row = rows[i];
      if (row) {
        row[j] = best;
      }
    }
  }
  return at(from.length, to.length);
}
