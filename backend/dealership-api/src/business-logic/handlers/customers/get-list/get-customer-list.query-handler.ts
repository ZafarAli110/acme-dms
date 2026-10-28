import {Inject, Injectable} from '@nestjs/common';
import type {IGetCustomerListQueryHandler} from '#business-logic-abstractions/handlers/customers/get-list/get-customer-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';
import type {PageQueryDto} from '#dto/paging/page-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import {CUSTOMER_REPOSITORY, type ICustomerRepository} from '#persistence/repositories/customer.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toCustomerListItemDto} from '../customer.mapper';

/** Customers of the user's selected location; `search` matches name, company, email or phone. */
@Injectable()
export class GetCustomerListQueryHandler implements IGetCustomerListQueryHandler {
  private readonly _customerRepository: ICustomerRepository;

  public constructor(@Inject(CUSTOMER_REPOSITORY) customerRepository: ICustomerRepository) {
    this._customerRepository = customerRepository;
  }

  public async executeAsync(
    userContext: UserContext,
    query: PageQueryDto,
  ): Promise<PageResponseDto<CustomerListItemDto>> {
    const locationId = requireLocation(userContext);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const {items, total} = await this._customerRepository.findPageForLocationAsync(
      userContext.dealerId,
      locationId,
      query.search ?? null,
      page,
      pageSize,
    );
    return {items: items.map(toCustomerListItemDto), total, page, pageSize};
  }
}
