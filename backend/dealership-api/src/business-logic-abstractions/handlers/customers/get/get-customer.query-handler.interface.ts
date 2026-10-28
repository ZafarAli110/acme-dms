import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';

export interface IGetCustomerQueryHandler {
  executeAsync(userContext: UserContext, customerId: string): Promise<CustomerResponseDto>;
}

export const GET_CUSTOMER_QUERY_HANDLER = Symbol('IGetCustomerQueryHandler');
