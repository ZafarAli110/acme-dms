import {describe, expect, it, vi} from 'vitest';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {Customer} from '#persistence/entities/customer.entity';
import type {ICustomerRepository} from '#persistence/repositories/customer.repository.interface';
import {GetRecentCustomersQueryHandler, RECENT_CUSTOMERS_LIMIT} from '../get-recent-customers.query-handler';

const maria: UserContext = {
  userId: 'maria',
  dealerId: 'northwind',
  locationId: 'riverside',
  permissions: ['customers.read'],
  accessToken: 't',
};

const contacted = (surname: string, lastContactDate: string) =>
  ({
    id: surname,
    firstName: 'Test',
    surname,
    lastContactDate: Temporal.PlainDate.from(lastContactDate),
    status: 'active',
  }) as Customer;

describe('GetRecentCustomersQueryHandler', () => {
  it('returns the most recently contacted customers, newest first, as the repository orders them', async () => {
    const findRecentlyContactedAsync = vi
      .fn()
      .mockResolvedValue([contacted('Byrne', '2026-10-26'), contacted('Doyle', '2026-10-23')]);
    const customers = {
      findRecentlyContactedAsync,
    } satisfies Partial<ICustomerRepository> as unknown as ICustomerRepository;

    const recent = await new GetRecentCustomersQueryHandler(customers).executeAsync(maria);

    expect(findRecentlyContactedAsync).toHaveBeenCalledWith('northwind', RECENT_CUSTOMERS_LIMIT);
    expect(recent.map((customer) => customer.surname)).toEqual(['Byrne', 'Doyle']);
  });
});
