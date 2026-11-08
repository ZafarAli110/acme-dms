import { sql } from "drizzle-orm";
import { customerNames } from "#persistence/schema/customer-names";
import type { Database } from "#persistence/unit-of-work/unit-of-work";

/** How far a close name may be from the word searched: two letters missing, extra, changed or swapped. */
const MAX_DISTANCE = 2;
/** At most this many close names are tried, closest first. */
const MAX_NAMES = 10;

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
 * The location's names close to the word: trigram neighbours or at most two edits away, closest first (edit distance,
 * then trigram similarity), whatever kind (first name, surname, company word), the word itself left out. Edit distance
 * finds "pnewood" → Penwood (2); sound-alike codes do not ("Pnewood" sounds like "Newood"). Under the request's policy.
 */
export async function closeNamesAsync(db: Database, word: string): Promise<CloseName[]> {
  const name = sql`lower(${customerNames.name})`;
  const result = await db.execute<{ name: string; distance: number }>(sql`
    select min(${customerNames.name}) as name, min(levenshtein(${name}, ${word})) as distance,
           max(similarity(${name}, ${word})) as likeness
    from ${customerNames}
    where (${name} % ${word} or levenshtein(${name}, ${word}) <= ${MAX_DISTANCE}) and ${name} <> ${word}
    group by ${name}
    having min(levenshtein(${name}, ${word})) <= ${MAX_DISTANCE} or max(similarity(${name}, ${word})) >= 0.3
    order by distance, likeness desc
    limit ${MAX_NAMES}`);
  return result.rows.map((row) => ({ name: row.name, distance: Number(row.distance) }));
}
