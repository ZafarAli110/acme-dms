import type { UnitOfWork } from "./unit-of-work";

/** Starts a unit of work: every use case reads and writes the database through one. */
export interface IUnitOfWorkFactory {
  /**
   * `readOnly` starts a read-only transaction: the database refuses any write in it. `asOwner` works as the
   * connection's own role even inside a request, so row-level security does not apply: only for a read that no signed-in
   * user can be scoped for, and that its caller has authorised some other way (a signed download link). Never for
   * anything a user's own token could reach.
   */
  beginAsync(options?: { readOnly: boolean; asOwner?: boolean }): Promise<UnitOfWork>;
}

export const UNIT_OF_WORK_FACTORY = Symbol("IUnitOfWorkFactory");
