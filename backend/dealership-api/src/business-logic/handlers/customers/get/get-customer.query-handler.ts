import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import type {IGetCustomerQueryHandler} from '#business-logic-abstractions/handlers/customers/get/get-customer.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';
import {CUSTOMER_REPOSITORY, type ICustomerRepository} from '#persistence/repositories/customer.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toCustomerResponseDto} from '../customer.mapper';

@Injectable()
export class GetCustomerQueryHandler implements IGetCustomerQueryHandler {
  private readonly _customerRepository: ICustomerRepository;

  public constructor(@Inject(CUSTOMER_REPOSITORY) customerRepository: ICustomerRepository) {
    this._customerRepository = customerRepository;
  }

  public async executeAsync(userContext: UserContext, customerId: string): Promise<CustomerResponseDto> {
    const customer = await this._customerRepository.findByIdAsync(
      userContext.dealerId,
      requireLocation(userContext),
      customerId,
    );
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found at this location.`);
    }
    return toCustomerResponseDto(customer);
  }
}
