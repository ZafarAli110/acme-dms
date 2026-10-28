import {describe, expect, it} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import {AT_NORTHSIDE} from '#business-logic/user-context/__test__/test-users';
import {NORTHSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {CreateCustomerCommandHandler} from '../create-customer.command-handler';

describe('CreateCustomerCommandHandler', () => {
  const database = useTestDatabase();

  it('adds the customer to the selected location', async () => {
    const created = await new CreateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()).executeAsync(
      AT_NORTHSIDE,
      {
        firstName: 'Grace',
        surname: 'Hopper',
        companyName: null,
        email: 'grace@example.test',
        phone: null,
        city: null,
        status: 'prospect',
        lastContactDate: '2026-10-21',
      },
    );

    expect(created).toMatchObject({
      locationId: NORTHSIDE,
      surname: 'Hopper',
      phone: null,
      lastContactDate: '2026-10-21',
    });
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });
});
