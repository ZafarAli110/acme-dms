import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { bins, type Bin } from "#persistence/schema/bins";
import { partInventories, type PartInventory } from "#persistence/schema/part-inventories";
import { partPhotos, type PartPhoto } from "#persistence/schema/part-photos";
import { parts, type Part } from "#persistence/schema/parts";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { estimateRowsAsync } from "../../list-query/estimate";
import { escapeLike } from "../../list-query/like-pattern";
import {
  type KeyedRow,
  type KeysetMove,
  type CursorRow,
  keyedFields,
  keyedRowOf,
  readKeysetPageAsync,
  type SortSpec,
  sortSpecOf,
} from "../../list-query/keyset";
import { listFilter, listOrderBy, type ListColumns } from "../../list-query/list-columns";
import { pageOffset } from "../../list-query/page-offset";
import { toPartWordsQuery } from "./get-list/part-words";

/** A part as one location stocks it: the catalogue record, its inventory there, and the bin it is in. */
export interface StockedPart {
  part: Part;
  inventory: PartInventory;
  bin: Bin;
}

/** What a list of stocked parts can be sorted and filtered by: the grid's field names. */
export const STOCKED_PART_COLUMNS: ListColumns = {
  partNumber: { source: parts.partNumber, type: "text" },
  description: { source: parts.description, type: "text" },
  bin: { source: bins.code, type: "text" },
  onHand: { source: partInventories.quantityOnHand, type: "number" },
  reorderLevel: { source: partInventories.reorderLevel, type: "number" },
  unitPriceCents: { source: parts.unitPriceCents, type: "number" },
};

/**
 * One page of the parts the request's location stocks in a live bin (row-level security picks the dealer, the location
 * and live rows), by part number unless the query sorts otherwise, narrowed by the query's filter, and whether another
 * page follows. A search goes through `findMatchingPartIdsAsync` instead.
 *
 * The page's ids come first, without the bins join unless the sort or filter is the bin: with it, Postgres guesses one
 * bin per location and joins and sorts the location's whole stock for every page; without it, it walks the
 * part-number index and stops at the page (ACME-124). The rows, with their bin, are then read for those ids alone.
 */
export async function findStockedPartsAsync(
  db: Database,
  query: ListQueryDto,
  move: KeysetMove | null = null,
  cursor: CursorRow | null = null,
): Promise<{ items: StockedPart[]; next: KeyedRow | null; previous: KeyedRow | null }> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const spec = partSortSpec(query);
  const select = (where: SQL | undefined, orderBy: SQL[], limit: number) => {
    const from = db
      .select(keyedFields(spec))
      .from(partInventories)
      .innerJoin(parts, eq(parts.id, partInventories.partId))
      .$dynamic();
    return (needsBin(query) ? from.innerJoin(bins, eq(bins.id, partInventories.binId)) : from)
      .where(and(liveBinStock(db), listFilter(STOCKED_PART_COLUMNS, query), where))
      .orderBy(...orderBy)
      .limit(limit);
  };
  if (move) {
    // Keyset (ACME-129): the rows after (or before) the cursor's, from the part-number index.
    const found = await readKeysetPageAsync(spec, move, cursor, pageSize, async (segment, limit) =>
      (await select(segment.where, segment.orderBy, limit)).map((row) => keyedRowOf(spec, row)),
    );
    return {
      ...found,
      items: await findStockedPartsByIdsAsync(
        db,
        found.rows.map((row) => row.id),
      ),
    };
  }
  // One more than the page says whether another follows, without counting.
  const rows = (
    await select(
      undefined,
      listOrderBy(STOCKED_PART_COLUMNS, query, [asc(parts.partNumber)], [parts.id]),
      pageSize + 1,
    ).offset(pageOffset(page, pageSize))
  ).map((row) => keyedRowOf(spec, row));
  const onPage = rows.slice(0, pageSize);
  return {
    items: await findStockedPartsByIdsAsync(
      db,
      onPage.map((row) => row.id),
    ),
    next: rows.length > pageSize ? (onPage.at(-1) ?? null) : null,
    previous: page > 1 ? (onPage[0] ?? null) : null,
  };
}

/** The parts list's order as keyset paging reads it: the same as the list's `listOrderBy`. */
export function partSortSpec(query: ListQueryDto): SortSpec {
  return sortSpecOf(STOCKED_PART_COLUMNS, query, [parts.partNumber], parts.id);
}

/**
 * How many parts the request's location stocks in a live bin, narrowed by the query's filter, up to `limit`: the rows
 * the list's pages show (ACME-124, 129). A search counts with `countMatchingPartsAsync` instead.
 */
export async function countStockedPartsAsync(db: Database, query: ListQueryDto, limit: number): Promise<number> {
  const from = db
    .select({ one: sql`1` })
    .from(partInventories)
    .innerJoin(parts, eq(parts.id, partInventories.partId))
    .$dynamic();
  const upTo = (needsBin(query) ? from.innerJoin(bins, eq(bins.id, partInventories.binId)) : from)
    .where(and(liveBinStock(db), listFilter(STOCKED_PART_COLUMNS, query)))
    .limit(limit)
    .as("up_to_limit");
  const [counted] = await db.select({ total: count() }).from(upTo);
  return counted?.total ?? 0;
}

/**
 * How many parts Postgres expects the location to stock, from its statistics (ACME-129): its inventory rows, under the
 * policy. The live-bins condition is left out, because Postgres cannot estimate it (14,101 expected for 24,221 at
 * Northside) and a part in a deleted bin is rare; without it, 24,266 for 24,223.
 */
export async function estimateStockedPartsAsync(db: Database): Promise<number> {
  return await estimateRowsAsync(db, db.select({ one: sql`1` }).from(partInventories));
}

/**
 * A search's page of part ids, best match first, and whether another page follows (ACME-123). The part number matches by any part of it, case ignored
 * (its trigram index): the number itself first, then numbers starting with the search, then numbers holding it. Then
 * the description, by its words (its GIN index): every word, each as a word's beginning, in its other forms, the
 * closest match first. A column sort replaces that order.
 *
 * `db` works as the tables' owner (`partSearchWhere`). Only ids come from here; the rows are read as the request
 * (`findStockedPartsByIdsAsync`), and how many match from `countMatchingPartsAsync`.
 */
export async function findMatchingPartIdsAsync(
  db: Database,
  scope: PartScope,
  query: ListQueryDto,
  search: string,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const terms = partSearchTerms(search);
  const bestFirst = [
    asc(sql`CASE WHEN ${terms.number} = ${terms.typed} THEN 0
                 WHEN ${terms.number} LIKE ${`${escapeLike(terms.typed)}%`} THEN 1
                 WHEN ${terms.holdsTyped} THEN 2
                 ELSE 3 END`),
    ...(terms.wordsQuery === null ? [] : [desc(sql`ts_rank_cd(${parts.searchWords}, ${terms.wordsQuery})`)]),
    asc(parts.partNumber),
  ];
  // One more than the page says whether another follows, without counting.
  const stock = db
    .select({ id: parts.id })
    .from(partInventories)
    .innerJoin(parts, eq(parts.id, partInventories.partId))
    .$dynamic();
  const rows = await (needsBin(query) ? stock.innerJoin(bins, eq(bins.id, partInventories.binId)) : stock)
    .where(partSearchWhere(db, scope, query, search))
    .orderBy(...listOrderBy(STOCKED_PART_COLUMNS, query, bestFirst, [parts.id]))
    .limit(pageSize + 1)
    .offset(pageOffset(page, pageSize));
  return { ids: rows.slice(0, pageSize).map((row) => row.id), hasMore: rows.length > pageSize };
}

/** How many parts a search matches at the location, up to `limit` (ACME-124, 129); `db` works as the tables' owner. */
export async function countMatchingPartsAsync(
  db: Database,
  scope: PartScope,
  query: ListQueryDto,
  search: string,
  limit: number,
): Promise<number> {
  const stock = db
    .select({ one: sql`1` })
    .from(partInventories)
    .innerJoin(parts, eq(parts.id, partInventories.partId))
    .$dynamic();
  const upTo = (needsBin(query) ? stock.innerJoin(bins, eq(bins.id, partInventories.binId)) : stock)
    .where(partSearchWhere(db, scope, query, search))
    .limit(limit)
    .as("up_to_limit");
  const [counted] = await db.select({ total: count() }).from(upTo);
  return counted?.total ?? 0;
}

/** The parts with these ids as the request's location stocks them, in the ids' order (a search's page). */
export async function findStockedPartsByIdsAsync(db: Database, ids: string[]): Promise<StockedPart[]> {
  if (ids.length === 0) {
    return [];
  }
  const found = await stockedParts(db, inArray(parts.id, ids));
  const byId = new Map(found.map((stocked) => [stocked.part.id, stocked]));
  return ids.flatMap((id) => {
    const stocked = byId.get(id);
    return stocked ? [stocked] : [];
  });
}

/** The part as the request's location stocks it, or null when it is not stocked there (or deleted). */
export async function findStockedPartAsync(db: Database, partId: string): Promise<StockedPart | null> {
  const [stocked] = await stockedParts(db, eq(partInventories.partId, partId));
  return stocked ?? null;
}

/** The part's photos, oldest first. */
export function findPhotosAsync(db: Database, partId: string): Promise<PartPhoto[]> {
  return db.select().from(partPhotos).where(eq(partPhotos.partId, partId)).orderBy(asc(partPhotos.createdAt));
}

/** Each part's thumbnail: its default photo when that is ready, otherwise its first ready photo. */
export async function findThumbnailsAsync(db: Database, partIds: string[]): Promise<Map<string, PartPhoto>> {
  if (partIds.length === 0) {
    return new Map();
  }
  const photos = await db
    .select()
    .from(partPhotos)
    .where(and(inArray(partPhotos.partId, partIds), eq(partPhotos.status, "ready")))
    .orderBy(desc(partPhotos.isDefault), asc(partPhotos.createdAt));
  const thumbnails = new Map<string, PartPhoto>();
  for (const photo of photos) {
    if (!thumbnails.has(photo.partId)) {
      thumbnails.set(photo.partId, photo);
    }
  }
  return thumbnails;
}

function stockedParts(db: Database, where: SQL | undefined) {
  return db
    .select({ part: parts, inventory: partInventories, bin: bins })
    .from(partInventories)
    .innerJoin(parts, eq(parts.id, partInventories.partId))
    .innerJoin(bins, eq(bins.id, partInventories.binId))
    .where(where)
    .$dynamic();
}

/** The dealer and the location a search written out by hand is for: the request's. */
export interface PartScope {
  dealerId: string;
  locationId: string;
}

/**
 * Stock in a live bin of the location: the bins policy decides which bins those are (the dealer, the location, not
 * deleted), and a location has a handful. Worked out first, as an array, rather than joined: Postgres guesses one bin
 * per location, and turns a join or an `IN (select …)` into joining and sorting the location's whole stock for every
 * page (66 ms at Northside's 24,211 stocked parts); with the array it walks the page's index and stops at the page
 * (3 ms; ACME-124).
 */
export function liveBinStock(db: Database): SQL {
  return sql`${partInventories.binId} = any(array(${db.select({ id: bins.id }).from(bins)}))`;
}

/** The list joins the bins only when it sorts or filters by one. */
function needsBin(query: ListQueryDto): boolean {
  return query.sort === "bin" || query.filterField === "bin";
}

function partSearchTerms(search: string) {
  const typed = search.toUpperCase();
  const number = sql`upper(${parts.partNumber})`;
  const words = toPartWordsQuery(search);
  return {
    typed,
    number,
    holdsTyped: sql`${number} LIKE ${`%${escapeLike(typed)}%`}`,
    wordsQuery: words === null ? null : sql`to_tsquery('english', ${words})`,
  };
}

/**
 * The rows a search matches, for the page and the count alike. Written for a `db` working as the tables' owner, so the
 * dealer, the location and live rows are written out, for the bin as for the part: under row-level security no index
 * could serve `@@` or LIKE, which are not leakproof (docs/standards/multi-tenancy.md).
 *
 * The live bins are an array, as `liveBinStock` does under the policy, and the bins are joined only when the query sorts
 * or filters by one. Joined, they made Postgres expect one bin at the location (Northside has 7) and walk its whole
 * stock (24,234 rows, 73,000 pages, 40 ms for "brake pads front"); with the array it finds the matching parts through
 * their indexes first (4,400 pages, 8 ms).
 */
function partSearchWhere(db: Database, scope: PartScope, query: ListQueryDto, search: string): SQL | undefined {
  const { holdsTyped, wordsQuery } = partSearchTerms(search);
  const liveBins = db
    .select({ id: bins.id })
    .from(bins)
    .where(and(eq(bins.dealerId, scope.dealerId), eq(bins.locationId, scope.locationId), notDeleted(bins)));
  return and(
    eq(parts.dealerId, scope.dealerId),
    eq(partInventories.locationId, scope.locationId),
    sql`${partInventories.binId} = any(array(${liveBins}))`,
    notDeleted(parts),
    notDeleted(partInventories),
    wordsQuery === null ? holdsTyped : or(holdsTyped, sql`${parts.searchWords} @@ ${wordsQuery}`),
    listFilter(STOCKED_PART_COLUMNS, query),
  );
}
