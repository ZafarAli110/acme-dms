import type {IUnitOfWorkFactory} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {createDatabasePool} from '#persistence/unit-of-work/database-pool';
import {UnitOfWorkFactory} from '#persistence/unit-of-work/unit-of-work.factory';
import type {TestDatabase} from './test-database';

/** The service's own unit of work factory, on a test database: what handler tests construct handlers with. */
export interface TestUnitOfWork extends AsyncDisposable {
  factory: IUnitOfWorkFactory;
}

export function createTestUnitOfWork(database: TestDatabase): TestUnitOfWork {
  const pool = createDatabasePool(database.connectionString);
  return {
    factory: new UnitOfWorkFactory(pool),
    async [Symbol.asyncDispose]() {
      await pool.end();
    },
  };
}
