import { sql } from "drizzle-orm";
import { customerNames } from "#persistence/schema/customer-names";
import type { Database } from "#persistence/unit-of-work/unit-of-work";

/** How far a close name may be from the word searched: two letters missing, extra, changed or swapped. */
const MAX_DISTANCE = 2;
/** At most this many close names are tried, closest first. */
const MAX_NAMES = 10;
/** Candidates Postgres gives for ranking here: more than are tried, so the ranking can reorder them. */
const CANDIDATES = 30;

/** A name the location has, close to the word searched, and how many edits away (levenshtein). */
export interface CloseName {
  name: string;
  distance: number;
}

/**
 * Whether the location has this word as a name: a known name is a correct spelling, and keeps today's list (ACME-120,
 * Zafar Ali, 8 Nov). Read under the request's policy: only its own location's names.
 */
export async function isKnownNameAsync(db: Database, word: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql`1` })
    .from(customerNames)
    .where(sql`lower(${customerNames.name}) = ${word}`)
    .limit(1);
  return rows.length > 0;
}

/**
 * The location's names close to the word: trigram neighbours or at most two edits away, whatever kind (first name,
 * surname, company word), the word itself left out. Postgres gives the candidates; they are ranked here by an edit
 * distance that counts two neighbouring letters swapped as one edit ("hpoper" is 1 from Hopper, 2 from Harper; plain
 * levenshtein makes both 2), then by trigram similarity. Sound-alike codes would miss "pnewood" (it sounds like
 * "Newood"). Under the request's policy.
 */
export async function closeNamesAsync(db: Database, word: string): Promise<CloseName[]> {
  const name = sql`lower(${customerNames.name})`;
  const result = await db.execute<{ name: string; likeness: number }>(sql`
    select min(${customerNames.name}) as name, max(similarity(${name}, ${word})) as likeness
    from ${customerNames}
    where (${name} % ${word} or levenshtein(${name}, ${word}) <= ${MAX_DISTANCE}) and ${name} <> ${word}
    group by ${name}
    order by min(levenshtein(${name}, ${word})), likeness desc
    limit ${CANDIDATES}`);
  return result.rows
    .map((row) => ({
      name: row.name,
      distance: editDistance(row.name.toLowerCase(), word),
      likeness: Number(row.likeness),
    }))
    .filter((candidate) => candidate.distance <= MAX_DISTANCE || candidate.likeness >= 0.3)
    .toSorted((a, b) => a.distance - b.distance || b.likeness - a.likeness)
    .slice(0, MAX_NAMES)
    .map(({ name: closeName, distance }) => ({ name: closeName, distance }));
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
