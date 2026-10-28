import {NotFoundException} from '@nestjs/common';
import {describe, expect, it} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import {AT_NORTHSIDE, AT_RIVERSIDE} from '#business-logic/user-context/__test__/test-users';
import {NORTHSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {UpdateCustomerCommandHandler} from '../update-customer.command-handler';

const ALL_FIELDS = {
  firstName: 'Grace',
  surname: 'Hopper',
  companyName: null,
  email: 'grace@example.test',
  phone: null,
  city: 'Hillcrest',
  status: 'active' as const,
  lastContactDate: '2026-10-21',
};

describe('UpdateCustomerCommandHandler', () => {
  const database = useTestDatabase();

  it('replaces every field, null included', async () => {
    const customer = await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: 'Hopper',
      companyName: 'Hopper Logistics',
    });

    const updated = await new UpdateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()).executeAsync(
      AT_NORTHSIDE,
      customer.id,
      ALL_FIELDS,
    );

    expect(updated).toMatchObject({...ALL_FIELDS, id: customer.id, locationId: NORTHSIDE});
    expect(updated.companyName).toBeNull();
  });

  it("refuses another location's customer", async () => {
    const customer = await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Hopper'});

    await expect(
      new UpdateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()).executeAsync(
        AT_RIVERSIDE,
        customer.id,
        ALL_FIELDS,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
