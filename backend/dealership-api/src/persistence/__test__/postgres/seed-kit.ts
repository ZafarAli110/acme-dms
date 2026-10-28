import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import * as schema from '../../schema';
import {bins, type Bin, customers, type Customer, parts, type Part, partInventories} from '../../schema';

/** Northwind's two rooftops, with the ids the identity seed gives them. */
export const NORTHSIDE = '20000000-0000-0000-0000-000000000001';
export const RIVERSIDE = '20000000-0000-0000-0000-000000000002';

/** Who and when, for every row a test seeds. */
export const TEST_USER_ID = '30000000-0000-0000-0000-0000000000aa';
export const SEEDED_AT = Temporal.Instant.from('2026-11-03T09:00:00Z');

const SEEDED_AUDIT = {createdAt: SEEDED_AT, createdBy: TEST_USER_ID, updatedAt: SEEDED_AT, updatedBy: TEST_USER_ID};
const DELETED_AUDIT = {isDeleted: true, deletedAt: SEEDED_AT, deletedBy: TEST_USER_ID};

/** Adds the rows a test needs straight through the schema, with audit columns filled in. */
export function seedKit(db: NodePgDatabase<typeof schema>) {
  async function addBinAsync(bin: Pick<Bin, 'locationId' | 'code'> & {deleted?: boolean}): Promise<Bin> {
    const {deleted, ...values} = bin;
    const [row] = await db
      .insert(bins)
      .values({description: `Bin ${bin.code}`, ...values, ...SEEDED_AUDIT, ...(deleted ? DELETED_AUDIT : {})})
      .returning();
    return row!;
  }

  async function addCustomerAsync(
    customer: Pick<Customer, 'locationId' | 'surname'> & Partial<Customer> & {deleted?: boolean},
  ): Promise<Customer> {
    const {deleted, ...values} = customer;
    const [row] = await db
      .insert(customers)
      .values({
        firstName: 'Test',
        companyName: null,
        email: null,
        phone: null,
        city: null,
        status: 'active',
        lastContactDate: null,
        ...values,
        ...SEEDED_AUDIT,
        ...(deleted ? DELETED_AUDIT : {}),
      })
      .returning();
    return row!;
  }

  /** A part in the catalogue, stocked at `locationId` in a new bin there. */
  async function addStockedPartAsync(stocked: {
    locationId: string;
    partNumber: string;
    quantityOnHand?: number;
    reorderLevel?: number;
    deleted?: boolean;
  }): Promise<{part: Part; bin: Bin}> {
    const [part] = await db
      .insert(parts)
      .values({
        partNumber: stocked.partNumber,
        description: `Part ${stocked.partNumber}`,
        unitPrice: 10,
        ...SEEDED_AUDIT,
        ...(stocked.deleted ? DELETED_AUDIT : {}),
      })
      .returning();
    const bin = await addBinAsync({locationId: stocked.locationId, code: `B-${stocked.partNumber}`});
    await db.insert(partInventories).values({
      locationId: stocked.locationId,
      partId: part!.id,
      binId: bin.id,
      quantityOnHand: stocked.quantityOnHand ?? 5,
      reorderLevel: stocked.reorderLevel ?? 2,
      ...SEEDED_AUDIT,
    });
    return {part: part!, bin};
  }

  return {addBinAsync, addCustomerAsync, addStockedPartAsync};
}
