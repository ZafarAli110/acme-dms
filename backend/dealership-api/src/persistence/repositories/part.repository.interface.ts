import type {PartInventory} from '../entities/part-inventory.entity';
import type {PartPhoto} from '../entities/part-photo.entity';
import type {Part} from '../entities/part.entity';

/** The dealer's part catalogue (master records). What a location stocks is in IPartInventoryRepository. */
export interface IPartRepository {
  findByIdAsync(dealerId: string, partId: string): Promise<Part | null>;
  existsWithPartNumberAsync(dealerId: string, partNumber: string): Promise<boolean>;
  /** Adds a new part together with its first inventory, in one transaction: a part never exists without stock. */
  createWithInventoryAsync(dealerId: string, part: Part, inventory: PartInventory): Promise<void>;
  saveAsync(dealerId: string, part: Part): Promise<Part>;
  /**
   * Saves the part and its photo changes in one transaction: soft-deletes `removedPhotoIds`, sets `isDefault` on the
   * kept photos, and adds `addedPhotos`, recording `deletedBy`/`updatedBy` at `at`. All of it is saved or none of it.
   */
  saveWithPhotosAsync(dealerId: string, part: Part, photos: PartPhotoChanges): Promise<void>;
}

export interface PartPhotoChanges {
  removedPhotoIds: string[];
  /** Who made the change, recorded on removed and re-defaulted photos. */
  deletedBy: string;
  at: Temporal.Instant;
  kept: {id: string; isDefault: boolean}[];
  addedPhotos: PartPhoto[];
}

export const PART_REPOSITORY = Symbol('IPartRepository');
