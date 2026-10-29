import {drizzle, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import pg, {type PoolClient} from 'pg';
import QueryStream from 'pg-query-stream';
import * as schema from '../schema';

// A streamed read hands dates and numerics over as the text Postgres sends ('2024-06-11', '30161.92'): nothing shifts
// a day or rounds on the way to a file.
const RAW_TEXT_TYPES = {
  getTypeParser: (oid: number, format?: 'text' | 'binary'): ((value: string) => unknown) =>
    oid === pg.types.builtins.DATE || oid === pg.types.builtins.NUMERIC
      ? (value: string): string => value
      : pg.types.getTypeParser(oid, format),
};

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

  /**
   * Runs one query and hands its rows over as they arrive, `batchSize` at a time through a server-side cursor, each
   * row an array in the select's order. For results too big to hold (an export); build the query with Drizzle and pass
   * `.toSQL()`. Destroy the stream to stop early.
   */
  public stream(query: {sql: string; params: unknown[]}, batchSize: number): QueryStream {
    return this._client.query(
      new QueryStream(query.sql, query.params, {batchSize, rowMode: 'array', types: RAW_TEXT_TYPES}),
    );
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
