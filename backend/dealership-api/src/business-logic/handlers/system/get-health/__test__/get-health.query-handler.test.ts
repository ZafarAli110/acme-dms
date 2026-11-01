import {describe, expect, it} from 'vitest';
import type {IUnitOfWorkFactory} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {GetHealthQueryHandler} from '../get-health.query-handler';

describe('GetHealthQueryHandler', () => {
  const database = useTestDatabase();

  it('reports ok, the service, the product version and a reachable database', async () => {
    await expect(new GetHealthQueryHandler(database.unitOfWorkFactory).executeAsync()).resolves.toEqual({
      service: 'dealership-api',
      status: 'ok',
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      databaseReachable: true,
    });
  });

  it('reports degraded when the database does not answer', async () => {
    const unreachable: IUnitOfWorkFactory = {beginAsync: () => Promise.reject(new Error('connection refused'))};

    await expect(new GetHealthQueryHandler(unreachable).executeAsync()).resolves.toMatchObject({
      status: 'degraded',
      databaseReachable: false,
    });
  });
});
