import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';
import type {PageQueryDto} from '#dto/paging/page-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';

export interface IGetCustomerListQueryHandler {
  executeAsync(userContext: UserContext, query: PageQueryDto): Promise<PageResponseDto<CustomerListItemDto>>;
}

export const GET_CUSTOMER_LIST_QUERY_HANDLER = Symbol('IGetCustomerListQueryHandler');
