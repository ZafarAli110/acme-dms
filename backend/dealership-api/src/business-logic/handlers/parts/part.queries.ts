import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { bins, type Bin } from "#persistence/schema/bins";
import { partInventories, type PartInventory } from "#persistence/schema/part-inventories";
import { partPhotos, type PartPhoto } from "#persistence/schema/part-photos";
import { parts, type Part } from "#persistence/schema/parts";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { escapeLike } from "../../list-query/like-pattern";
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
 * One page of the parts the request's location stocks (row-level security picks the dealer and the location), by part
 * number unless the query sorts otherwise, narrowed by the query's filter. A search goes through
 * `findMatchingPartIdsAsync` instead.
 */
export async function findStockedPartsAsync(
  db: Database,
  query: ListQueryDto,
): Promise<{ items: StockedPart[]; total: number }> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const where = listFilter(STOCKED_PART_COLUMNS, query);
  const items = await stockedParts(db, where)
    .orderBy(...listOrderBy(STOCKED_PART_COLUMNS, query, [asc(parts.partNumber)], [asc(parts.id)]))
    .limit(pageSize)
    .offset(pageOffset(page, pageSize));
  // The same joins as the page, so a filter on the bin counts the same rows it shows.
  const [counted] = await db
    .select({ total: count() })
    .from(partInventories)
    .innerJoin(parts, eq(parts.id, partInventories.partId))
    .innerJoin(bins, eq(bins.id, partInventories.binId))
    .where(where);
  return { items, total: counted?.total ?? 0 };
}

/**
 * A search's page of part ids, best match first, and how many match (ACME-123). The part number matches by any part of
 * it, case ignored (its trigram index): the number itself first, then numbers starting with the search, then numbers
 * holding it. Then the description, by its words (its GIN index): every word, each as a word's beginning, in its other
 * forms, the closest match first. A column sort replaces that order.
 *
 * `db` works as the tables' owner, so the dealer, the location and live rows are written out here, for the bin as for
 * the part (a filter or sort may name the bin): under row-level security no index could serve `@@` or LIKE, which are
 * not leakproof (docs/standards/multi-tenancy.md). Only ids and the count come from here; the rows are read as the
 * request (`findStockedPartsByIdsAsync`).
 */
export async function findMatchingPartIdsAsync(
  db: Database,
  scope: { dealerId: string; locationId: string },
  query: ListQueryDto,
  search: string,
): Promise<{ ids: string[]; total: number }> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const typed = search.toUpperCase();
  const number = sql`upper(${parts.partNumber})`;
  const holdsTyped = sql`${number} LIKE ${`%${escapeLike(typed)}%`}`;
  const words = toPartWordsQuery(search);
  const wordsQuery = words === null ? null : sql`to_tsquery('english', ${words})`;
  const where = and(
    eq(parts.dealerId, scope.dealerId),
    eq(partInventories.locationId, scope.locationId),
    eq(bins.locationId, scope.locationId),
    notDeleted(parts),
    notDeleted(partInventories),
    notDeleted(bins),
    wordsQuery === null ? holdsTyped : or(holdsTyped, sql`${parts.searchWords} @@ ${wordsQuery}`),
    listFilter(STOCKED_PART_COLUMNS, query),
  );
  const bestFirst = [
    asc(sql`CASE WHEN ${number} = ${typed} THEN 0
                 WHEN ${number} LIKE ${`${escapeLike(typed)}%`} THEN 1
                 WHEN ${holdsTyped} THEN 2
                 ELSE 3 END`),
    ...(wordsQuery === null ? [] : [desc(sql`ts_rank_cd(${parts.searchWords}, ${wordsQuery})`)]),
    asc(parts.partNumber),
  ];
  // The total comes with the page (`count(*) over ()`), so the matches are read once, not again by a count.
  const rows = await db
    .select({ id: parts.id, total: sql<number>`count(*) over ()`.mapWith(Number) })
    .from(partInventories)
    .innerJoin(parts, eq(parts.id, partInventories.partId))
    .innerJoin(bins, eq(bins.id, partInventories.binId))
    .where(where)
    .orderBy(...listOrderBy(STOCKED_PART_COLUMNS, query, bestFirst, [asc(parts.id)]))
    .limit(pageSize)
    .offset(pageOffset(page, pageSize));
  const [first] = rows;
  if (first) {
    return { ids: rows.map((row) => row.id), total: first.total };
  }
  // A page past the last has no rows to carry the total: count it on its own.
  const [counted] = await db
    .select({ total: count() })
    .from(partInventories)
    .innerJoin(parts, eq(parts.id, partInventories.partId))
    .innerJoin(bins, eq(bins.id, partInventories.binId))
    .where(where);
  return { ids: [], total: counted?.total ?? 0 };
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
