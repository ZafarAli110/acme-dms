import {Inject, Injectable} from '@nestjs/common';
import type {IGetRecentCustomersQueryHandler} from '#business-logic-abstractions/handlers/customers/get-recent/get-recent-customers.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';
import {CUSTOMER_REPOSITORY, type ICustomerRepository} from '#persistence/repositories/customer.repository.interface';
import {toCustomerListItemDto} from '../customer.mapper';

/** How many customers the "Recently contacted" panel on the home page shows. */
export const RECENT_CUSTOMERS_LIMIT = 5;

/** The customers contacted most recently, newest first, for the home page. */
@Injectable()
export class GetRecentCustomersQueryHandler implements IGetRecentCustomersQueryHandler {
  private readonly _customerRepository: ICustomerRepository;

  public constructor(@Inject(CUSTOMER_REPOSITORY) customerRepository: ICustomerRepository) {
    this._customerRepository = customerRepository;
  }

  public async executeAsync(userContext: UserContext): Promise<CustomerListItemDto[]> {
    const customers = await this._customerRepository.findRecentlyContactedAsync(
      userContext.dealerId,
      RECENT_CUSTOMERS_LIMIT,
    );
    return customers.map(toCustomerListItemDto);
  }
}
