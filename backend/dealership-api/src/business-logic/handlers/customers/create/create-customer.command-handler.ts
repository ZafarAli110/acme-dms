import {Inject, Injectable} from '@nestjs/common';
import type {ICreateCustomerCommandHandler} from '#business-logic-abstractions/handlers/customers/create/create-customer.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {createdAudit} from '../../../audit/audit-fields';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerCreateRequestDto} from '#dto/customers/customer-create-request.dto';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';
import type {Customer} from '#persistence/entities/customer.entity';
import {CUSTOMER_REPOSITORY, type ICustomerRepository} from '#persistence/repositories/customer.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toCustomerResponseDto} from '../customer.mapper';

/** The customer joins the location the user is working at; it is never taken from the request body. */
@Injectable()
export class CreateCustomerCommandHandler implements ICreateCustomerCommandHandler {
  private readonly _customerRepository: ICustomerRepository;
  private readonly _clock: IClock;

  public constructor(
    @Inject(CUSTOMER_REPOSITORY) customerRepository: ICustomerRepository,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._customerRepository = customerRepository;
    this._clock = clock;
  }

  public async executeAsync(userContext: UserContext, request: CustomerCreateRequestDto): Promise<CustomerResponseDto> {
    const now = this._clock.now();
    const customer: Customer = {
      id: crypto.randomUUID(),
      dealerId: userContext.dealerId,
      locationId: requireLocation(userContext),
      firstName: request.firstName,
      surname: request.surname,
      companyName: request.companyName,
      email: request.email,
      phone: request.phone,
      city: request.city,
      status: request.status,
      lastContactDate: request.lastContactDate === null ? null : Temporal.PlainDate.from(request.lastContactDate),
      ...createdAudit(userContext.userId, now),
    };
    await this._customerRepository.saveAsync(userContext.dealerId, customer);
    return toCustomerResponseDto(customer);
  }
}
