import type { Pool } from "pg";
import { currentDataScope, isInRequest } from "#request-scope/data-scope";
import { UnitOfWork } from "./unit-of-work";
import type { IUnitOfWorkFactory } from "./unit-of-work.factory.interface";

/** The database role a request works as: row-level security policies apply to it (the `row_level_security` migration). */
export const REQUEST_ROLE = "dealership_api_user";

/**
 * Opens a unit of work. Inside a request, the transaction works as REQUEST_ROLE with the request's dealer, location
 * and user, so Postgres row-level security filters every query by them: handlers do not repeat the dealer or the
 * location in their own `where`. A request whose scope was never set (a public endpoint, a guard that did not run)
 * works as REQUEST_ROLE with no scope at all, and sees no business row. Outside a request (the export worker, the
 * consumer, the seed) it works as the connection's own role, which owns the tables and is not filtered: that code
 * filters by hand. `asOwner` asks for that role inside a request too (see the interface).
 */
export class UnitOfWorkFactory implements IUnitOfWorkFactory {
  private readonly _pool: Pool;

  public constructor(pool: Pool) {
    this._pool = pool;
  }

  public async beginAsync(
    options: { readOnly: boolean; asOwner?: boolean } = { readOnly: false },
  ): Promise<UnitOfWork> {
    const client = await this._pool.connect();
    try {
      await client.query(options.readOnly ? "BEGIN READ ONLY" : "BEGIN");
      const scope = currentDataScope();
      if (!options.asOwner && (scope || isInRequest())) {
        // For this transaction only (is_local true): the connection goes back to the pool as it came. An empty
        // setting is NULL to the policies, which matches no row.
        await client.query(
          "SELECT set_config('role', $1, true), set_config('app.dealer_id', $2, true), " +
            "set_config('app.location_id', $3, true), set_config('app.user_id', $4, true)",
          [REQUEST_ROLE, scope?.dealerId ?? "", scope?.locationId ?? "", scope?.userId ?? ""],
        );
      }
    } catch (error) {
      client.release(error instanceof Error ? error : true);
      throw error;
    }
    return new UnitOfWork(client);
  }
}
