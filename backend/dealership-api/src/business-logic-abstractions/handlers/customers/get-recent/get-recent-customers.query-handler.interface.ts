import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';

export interface IGetRecentCustomersQueryHandler {
  executeAsync(userContext: UserContext): Promise<CustomerListItemDto[]>;
}

export const GET_RECENT_CUSTOMERS_QUERY_HANDLER = Symbol('IGetRecentCustomersQueryHandler');
