import {describe, expect, it} from 'vitest';
import {NORTHSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {GetRecentCustomersQueryHandler} from '../get-recent-customers.query-handler';

describe('GetRecentCustomersQueryHandler', () => {
  const database = useTestDatabase();

  it('returns the most recently contacted customers, newest first', async () => {
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: 'Doyle',
      lastContactDate: Temporal.PlainDate.from('2026-10-23'),
    });
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: 'Byrne',
      lastContactDate: Temporal.PlainDate.from('2026-10-26'),
    });
    await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Never'});

    const recent = await new GetRecentCustomersQueryHandler(database.unitOfWorkFactory).executeAsync();

    expect(recent.map((customer) => customer.surname)).toEqual(['Byrne', 'Doyle']);
  });
});
