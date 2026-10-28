import type {UnitOfWork} from './unit-of-work';

/** Starts a unit of work: every use case reads and writes the database through one. */
export interface IUnitOfWorkFactory {
  /** `readOnly` starts a read-only transaction: the database refuses any write in it. */
  beginAsync(options?: {readOnly: boolean}): Promise<UnitOfWork>;
}

export const UNIT_OF_WORK_FACTORY = Symbol('IUnitOfWorkFactory');
