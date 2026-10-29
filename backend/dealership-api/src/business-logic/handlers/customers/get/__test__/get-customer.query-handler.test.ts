import {NotFoundException} from '@nestjs/common';
import {describe, expect, it} from 'vitest';
import {AT_NORTHSIDE, AT_RIVERSIDE} from '#test-setup/users/test-users';
import {NORTHSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {GetCustomerQueryHandler} from '../get-customer.query-handler';

describe('GetCustomerQueryHandler', () => {
  const database = useTestDatabase();

  it('returns a customer of the selected location', async () => {
    const customer = await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Berg'});

    await expect(
      new GetCustomerQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE, customer.id),
    ).resolves.toMatchObject({id: customer.id, surname: 'Berg'});
  });

  it("returns another location's customer as not found", async () => {
    const customer = await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Berg'});

    await expect(
      new GetCustomerQueryHandler(database.unitOfWorkFactory).executeAsync(AT_RIVERSIDE, customer.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns a deleted customer as not found', async () => {
    const customer = await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Gone', deleted: true});

    await expect(
      new GetCustomerQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE, customer.id),
    ).rejects.toThrow(NotFoundException);
  });
});
