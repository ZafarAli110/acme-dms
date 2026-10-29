import {and, asc, count, desc, eq, ilike, inArray, or, type SQL} from 'drizzle-orm';
import {
  bins,
  type Bin,
  notDeleted,
  partInventories,
  type PartInventory,
  partPhotos,
  type PartPhoto,
  parts,
  type Part,
} from '#persistence/schema/index';
import type {Database} from '#persistence/unit-of-work/unit-of-work';
import type {ListQueryDto} from '#dto/paging/list-query.dto';
import {listFilter, listOrderBy, type ListColumns} from '../../list-query/list-columns';

/** A part as one location stocks it: the catalogue record, its inventory there, and the bin it is in. */
export interface StockedPart {
  part: Part;
  inventory: PartInventory;
  bin: Bin;
}

/** What a list of stocked parts can be sorted and filtered by: the grid's field names. */
export const STOCKED_PART_COLUMNS: ListColumns = {
  partNumber: {source: parts.partNumber, type: 'text'},
  description: {source: parts.description, type: 'text'},
  bin: {source: bins.code, type: 'text'},
  onHand: {source: partInventories.quantityOnHand, type: 'number'},
  reorderLevel: {source: partInventories.reorderLevel, type: 'number'},
  unitPrice: {source: parts.unitPrice, type: 'number'},
};

/**
 * One page of the parts `locationId` stocks, by part number unless the query sorts otherwise. `search` matches the
 * number or the description; the query's filter narrows it further.
 */
export async function findStockedPartsAsync(
  db: Database,
  locationId: string,
  query: ListQueryDto,
): Promise<{items: StockedPart[]; total: number}> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const where = and(
    eq(partInventories.locationId, locationId),
    notDeleted(partInventories),
    query.search
      ? or(ilike(parts.partNumber, `%${query.search}%`), ilike(parts.description, `%${query.search}%`))
      : undefined,
    listFilter(STOCKED_PART_COLUMNS, query),
  );
  const items = await stockedParts(db, where)
    .orderBy(...listOrderBy(STOCKED_PART_COLUMNS, query, [asc(parts.partNumber)], [asc(parts.id)]))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  // The same joins as the page, so a filter on the bin counts the same rows it shows.
  const [counted] = await db
    .select({total: count()})
    .from(partInventories)
    .innerJoin(parts, and(eq(parts.id, partInventories.partId), notDeleted(parts)))
    .innerJoin(bins, and(eq(bins.id, partInventories.binId), notDeleted(bins)))
    .where(where);
  return {items, total: counted?.total ?? 0};
}

/** The part as `locationId` stocks it, or null when it is not stocked there (or deleted). */
export async function findStockedPartAsync(
  db: Database,
  locationId: string,
  partId: string,
): Promise<StockedPart | null> {
  const [stocked] = await stockedParts(
    db,
    and(eq(partInventories.locationId, locationId), eq(partInventories.partId, partId), notDeleted(partInventories)),
  );
  return stocked ?? null;
}

/** The part's photos, oldest first. */
export function findPhotosAsync(db: Database, partId: string): Promise<PartPhoto[]> {
  return db
    .select()
    .from(partPhotos)
    .where(and(eq(partPhotos.partId, partId), notDeleted(partPhotos)))
    .orderBy(asc(partPhotos.createdAt));
}

/** Each part's thumbnail: its default photo when that is ready, otherwise its first ready photo. */
export async function findThumbnailsAsync(db: Database, partIds: string[]): Promise<Map<string, PartPhoto>> {
  if (partIds.length === 0) {
    return new Map();
  }
  const photos = await db
    .select()
    .from(partPhotos)
    .where(and(inArray(partPhotos.partId, partIds), eq(partPhotos.status, 'ready'), notDeleted(partPhotos)))
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
    .select({part: parts, inventory: partInventories, bin: bins})
    .from(partInventories)
    .innerJoin(parts, and(eq(parts.id, partInventories.partId), notDeleted(parts)))
    .innerJoin(bins, and(eq(bins.id, partInventories.binId), notDeleted(bins)))
    .where(where)
    .$dynamic();
}
