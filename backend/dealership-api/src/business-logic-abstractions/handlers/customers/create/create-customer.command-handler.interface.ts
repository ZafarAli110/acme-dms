import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerCreateRequestDto} from '#dto/customers/customer-create-request.dto';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';

export interface ICreateCustomerCommandHandler {
  executeAsync(userContext: UserContext, request: CustomerCreateRequestDto): Promise<CustomerResponseDto>;
}

export const CREATE_CUSTOMER_COMMAND_HANDLER = Symbol('ICreateCustomerCommandHandler');
