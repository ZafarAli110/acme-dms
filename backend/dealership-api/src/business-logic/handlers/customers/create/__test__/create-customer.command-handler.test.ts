import {describe, expect, it, vi} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {Customer} from '#persistence/entities/customer.entity';
import type {ICustomerRepository} from '#persistence/repositories/customer.repository.interface';
import {CreateCustomerCommandHandler} from '../create-customer.command-handler';

const sam: UserContext = {
  userId: 'sam',
  dealerId: 'northwind',
  locationId: 'northside',
  permissions: ['customers.write'],
  accessToken: 't',
};

describe('CreateCustomerCommandHandler', () => {
  it('adds the customer to the location the user is working at', async () => {
    const saveAsync = vi.fn((_dealerId: string, customer: Customer) => Promise.resolve(customer));
    const customers = {saveAsync} satisfies Partial<ICustomerRepository> as unknown as ICustomerRepository;

    const created = await new CreateCustomerCommandHandler(customers, fixedClock()).executeAsync(sam, {
      firstName: 'Grace',
      surname: 'Hopper',
      companyName: null,
      email: 'grace@example.test',
      phone: null,
      city: null,
      status: 'prospect',
      lastContactDate: null,
    });

    expect(saveAsync).toHaveBeenCalledWith('northwind', expect.objectContaining({locationId: 'northside'}));
    expect(created).toMatchObject({locationId: 'northside', surname: 'Hopper', phone: null, status: 'prospect'});
  });
});
