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

/** A part as one location stocks it: the catalogue record, its inventory there, and the bin it is in. */
export interface StockedPart {
  part: Part;
  inventory: PartInventory;
  bin: Bin;
}

/** One page of the parts `locationId` stocks, by part number; `search` matches the number or the description. */
export async function findStockedPartsAsync(
  db: Database,
  locationId: string,
  {search, page, pageSize}: {search: string | null; page: number; pageSize: number},
): Promise<{items: StockedPart[]; total: number}> {
  const where = and(
    eq(partInventories.locationId, locationId),
    notDeleted(partInventories),
    search ? or(ilike(parts.partNumber, `%${search}%`), ilike(parts.description, `%${search}%`)) : undefined,
  );
  const items = await stockedParts(db, where)
    .orderBy(asc(parts.partNumber))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [counted] = await db
    .select({total: count()})
    .from(partInventories)
    .innerJoin(parts, and(eq(parts.id, partInventories.partId), notDeleted(parts)))
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
