import type {Bin} from '../entities/bin.entity';
import type {PartInventory} from '../entities/part-inventory.entity';
import type {Part} from '../entities/part.entity';

/** A part as stocked at one location: the catalogue record, its inventory there and the bin it is kept in. */
export interface StockedPart {
  part: Part;
  inventory: PartInventory;
  bin: Bin;
}

export interface StockedPartPage {
  items: StockedPart[];
  total: number;
}

/** Inventory is per location: every method takes the location explicitly. */
export interface IPartInventoryRepository {
  /** The parts stocked at the location; `search` matches part number or description. */
  findPageForLocationAsync(
    dealerId: string,
    locationId: string,
    search: string | null,
    page: number,
    pageSize: number,
  ): Promise<StockedPartPage>;
  /** The part's inventory at the location, or null when the location does not stock it. */
  findForPartAsync(
    dealerId: string,
    locationId: string,
    partId: string,
  ): Promise<{inventory: PartInventory; bin: Bin} | null>;
  saveAsync(dealerId: string, inventory: PartInventory): Promise<PartInventory>;
}

export const PART_INVENTORY_REPOSITORY = Symbol('IPartInventoryRepository');
