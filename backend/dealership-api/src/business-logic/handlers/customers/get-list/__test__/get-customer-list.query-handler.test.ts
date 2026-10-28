import {BadRequestException} from '@nestjs/common';
import {describe, expect, it, vi} from 'vitest';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ICustomerRepository} from '#persistence/repositories/customer.repository.interface';
import {GetCustomerListQueryHandler} from '../get-customer-list.query-handler';

const maria: UserContext = {
  userId: 'maria',
  dealerId: 'northwind',
  locationId: 'riverside',
  permissions: ['customers.read'],
  accessToken: 't',
};

describe('GetCustomerListQueryHandler', () => {
  it("lists customers of the user's selected location only", async () => {
    const customers = {
      findPageForLocationAsync: vi.fn().mockResolvedValue({items: [], total: 0}),
    } satisfies Partial<ICustomerRepository> as unknown as ICustomerRepository;

    await new GetCustomerListQueryHandler(customers).executeAsync(maria, {search: 'hopper'});

    expect(customers.findPageForLocationAsync).toHaveBeenCalledWith('northwind', 'riverside', 'hopper', 1, 25);
  });

  it('needs a selected location', async () => {
    const customers = {
      findPageForLocationAsync: vi.fn(),
    } satisfies Partial<ICustomerRepository> as unknown as ICustomerRepository;

    await expect(
      new GetCustomerListQueryHandler(customers).executeAsync({...maria, locationId: null}, {}),
    ).rejects.toThrow(BadRequestException);
    expect(customers.findPageForLocationAsync).not.toHaveBeenCalled();
  });
});
