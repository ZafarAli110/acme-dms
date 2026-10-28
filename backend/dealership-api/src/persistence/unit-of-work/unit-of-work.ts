import {drizzle, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import type {PoolClient} from 'pg';
import * as schema from '../schema';

/** Typed access to the dealership database: tables, columns, joins and results all come from the schema. */
export type Database = NodePgDatabase<typeof schema>;

/**
 * One use case's work: one connection, one transaction. Hold it with `await using`, so it is always finished:
 * `commitAsync()` keeps what was written; leaving the block without a commit (a read, or an error) rolls it back.
 *
 *   await using work = await this._unitOfWorkFactory.beginAsync();
 *   const [part] = await work.db.insert(parts).values(newPart).returning();
 *   await work.commitAsync();
 */
export class UnitOfWork implements AsyncDisposable {
  public readonly db: Database;
  private readonly _client: PoolClient;
  private _committed = false;

  public constructor(client: PoolClient) {
    this._client = client;
    this.db = drizzle(client, {schema});
  }

  public async commitAsync(): Promise<void> {
    if (this._committed) {
      throw new Error('The unit of work is already committed.');
    }
    await this._client.query('COMMIT');
    this._committed = true;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this._committed) {
      this._client.release();
      return;
    }
    try {
      await this._client.query('ROLLBACK');
      this._client.release();
    } catch (error) {
      // A connection that can't roll back is not given back to the pool.
      this._client.release(error instanceof Error ? error : true);
    }
  }
}
