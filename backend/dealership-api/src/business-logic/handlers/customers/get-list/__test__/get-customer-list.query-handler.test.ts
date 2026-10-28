import {describe, expect, it} from 'vitest';
import {AT_NORTHSIDE} from '#business-logic/user-context/__test__/test-users';
import {NORTHSIDE, RIVERSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {GetCustomerListQueryHandler} from '../get-customer-list.query-handler';

describe('GetCustomerListQueryHandler', () => {
  const database = useTestDatabase();

  it("lists only the selected location's customers, searching name, company, email and phone", async () => {
    await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Hopper', companyName: 'Hopper Logistics'});
    await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Lovelace'});
    await database.seed.addCustomerAsync({locationId: RIVERSIDE, surname: 'Hopper'});
    await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Hopperton', deleted: true});
    const handler = new GetCustomerListQueryHandler(database.unitOfWorkFactory);

    const all = await handler.executeAsync(AT_NORTHSIDE, {page: 1, pageSize: 25, search: undefined});
    const found = await handler.executeAsync(AT_NORTHSIDE, {page: 1, pageSize: 25, search: 'hopper'});

    expect(all.items.map((customer) => customer.surname)).toEqual(['Hopper', 'Lovelace']);
    expect(all.total).toBe(2);
    expect(found.items.map((customer) => customer.companyName)).toEqual(['Hopper Logistics']);
    expect(found.total).toBe(1);
  });

  it('pages the list', async () => {
    for (const surname of ['Adams', 'Brown', 'Clark']) {
      await database.seed.addCustomerAsync({locationId: RIVERSIDE, surname});
    }
    const handler = new GetCustomerListQueryHandler(database.unitOfWorkFactory);
    const riverside = {...AT_NORTHSIDE, locationId: RIVERSIDE};

    const second = await handler.executeAsync(riverside, {page: 2, pageSize: 2, search: undefined});

    expect(second.items.map((customer) => customer.surname)).toEqual(['Clark', 'Hopper']);
    expect(second).toMatchObject({total: 4, page: 2, pageSize: 2});
  });
});
