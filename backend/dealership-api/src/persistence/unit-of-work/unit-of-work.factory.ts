import type {Pool} from 'pg';
import {UnitOfWork} from './unit-of-work';
import type {IUnitOfWorkFactory} from './unit-of-work.factory.interface';

export class UnitOfWorkFactory implements IUnitOfWorkFactory {
  private readonly _pool: Pool;

  public constructor(pool: Pool) {
    this._pool = pool;
  }

  public async beginAsync(options: {readOnly: boolean} = {readOnly: false}): Promise<UnitOfWork> {
    const client = await this._pool.connect();
    try {
      await client.query(options.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    } catch (error) {
      client.release(error instanceof Error ? error : true);
      throw error;
    }
    return new UnitOfWork(client);
  }
}
