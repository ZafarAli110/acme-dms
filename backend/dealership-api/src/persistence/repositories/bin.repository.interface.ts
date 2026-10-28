import type {Bin} from '../entities/bin.entity';

/** Bins belong to one location: every method takes the location explicitly. */
export interface IBinRepository {
  findForLocationAsync(dealerId: string, locationId: string): Promise<Bin[]>;
  findByIdAsync(dealerId: string, locationId: string, binId: string): Promise<Bin | null>;
  existsWithCodeAsync(dealerId: string, locationId: string, code: string): Promise<boolean>;
  saveAsync(dealerId: string, bin: Bin): Promise<Bin>;
}

export const BIN_REPOSITORY = Symbol('IBinRepository');
