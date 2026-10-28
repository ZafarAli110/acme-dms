import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import type {IUpdateCustomerCommandHandler} from '#business-logic-abstractions/handlers/customers/update/update-customer.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {updatedAudit} from '../../../audit/audit-fields';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';
import type {CustomerUpdateRequestDto} from '#dto/customers/customer-update-request.dto';
import {CUSTOMER_REPOSITORY, type ICustomerRepository} from '#persistence/repositories/customer.repository.interface';
import type {Customer} from '#persistence/entities/customer.entity';
import {requireLocation} from '../../../user-context/require-location';
import {toCustomerResponseDto} from '../customer.mapper';

@Injectable()
export class UpdateCustomerCommandHandler implements IUpdateCustomerCommandHandler {
  private readonly _customerRepository: ICustomerRepository;
  private readonly _clock: IClock;

  public constructor(
    @Inject(CUSTOMER_REPOSITORY) customerRepository: ICustomerRepository,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._customerRepository = customerRepository;
    this._clock = clock;
  }

  public async executeAsync(
    userContext: UserContext,
    customerId: string,
    request: CustomerUpdateRequestDto,
  ): Promise<CustomerResponseDto> {
    const customer = await this._customerRepository.findByIdAsync(
      userContext.dealerId,
      requireLocation(userContext),
      customerId,
    );
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} was not found at this location.`);
    }

    // PUT: every field comes from the request; identity, location and creation stay as they were.
    const updated: Customer = {
      ...customer,
      firstName: request.firstName,
      surname: request.surname,
      companyName: request.companyName,
      email: request.email,
      phone: request.phone,
      city: request.city,
      status: request.status,
      lastContactDate: request.lastContactDate === null ? null : Temporal.PlainDate.from(request.lastContactDate),
      ...updatedAudit(userContext.userId, this._clock.now()),
    };
    await this._customerRepository.saveAsync(userContext.dealerId, updated);
    return toCustomerResponseDto(updated);
  }
}
