import type {Bin} from '../entities/bin.entity';
import type {NewEntity} from '../entities/generated-id';

/** Bins belong to one location: every method takes the location explicitly. */
export interface IBinRepository {
  findForLocationAsync(dealerId: string, locationId: string): Promise<Bin[]>;
  findByIdAsync(dealerId: string, locationId: string, binId: string): Promise<Bin | null>;
  existsWithCodeAsync(dealerId: string, locationId: string, code: string): Promise<boolean>;
  /** Inserts a new row (the database assigns its id) or updates an existing one; returns the row as saved. */
  saveAsync(dealerId: string, bin: Bin | NewEntity<Bin>): Promise<Bin>;
}

export const BIN_REPOSITORY = Symbol('IBinRepository');
