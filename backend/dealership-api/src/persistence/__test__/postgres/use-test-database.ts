import {afterAll, beforeAll} from 'vitest';
import type {IUnitOfWorkFactory} from '../../unit-of-work/unit-of-work.factory.interface';
import {seedKit} from './seed-kit';
import {createTestDatabaseAsync, type TestDatabase} from './test-database';
import {createTestUnitOfWork, type TestUnitOfWork} from './test-unit-of-work';

export interface TestDatabaseContext {
  /** Drizzle straight on the test database, for checking what a handler wrote. */
  readonly db: TestDatabase['db'];
  /** The service's unit of work factory on the test database: what handlers are constructed with. */
  readonly unitOfWorkFactory: IUnitOfWorkFactory;
  readonly seed: ReturnType<typeof seedKit>;
}

/**
 * A database of this test file's own for its tests (created before them, dropped after). Call once at the top of a
 * `describe`; read the fields inside tests, not while the suite is being defined.
 */
export function useTestDatabase(): TestDatabaseContext {
  let database: TestDatabase | null = null;
  let unitOfWork: TestUnitOfWork | null = null;

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
    unitOfWork = createTestUnitOfWork(database);
  });

  afterAll(async () => {
    await unitOfWork?.[Symbol.asyncDispose]();
    await database?.[Symbol.asyncDispose]();
  });

  function ready(): {database: TestDatabase; unitOfWork: TestUnitOfWork} {
    if (!database || !unitOfWork) {
      throw new Error('The test database is created in beforeAll: use it inside a test.');
    }
    return {database, unitOfWork};
  }

  return {
    get db() {
      return ready().database.db;
    },
    get unitOfWorkFactory() {
      return ready().unitOfWork.factory;
    },
    get seed() {
      return seedKit(ready().database.db);
    },
  };
}
