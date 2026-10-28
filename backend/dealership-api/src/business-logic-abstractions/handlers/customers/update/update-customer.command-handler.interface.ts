import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';
import type {CustomerUpdateRequestDto} from '#dto/customers/customer-update-request.dto';

export interface IUpdateCustomerCommandHandler {
  executeAsync(
    userContext: UserContext,
    customerId: string,
    request: CustomerUpdateRequestDto,
  ): Promise<CustomerResponseDto>;
}

export const UPDATE_CUSTOMER_COMMAND_HANDLER = Symbol('IUpdateCustomerCommandHandler');
