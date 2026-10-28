import {Inject, Injectable} from '@nestjs/common';
import type {ICreateCustomerCommandHandler} from '#business-logic-abstractions/handlers/customers/create/create-customer.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerCreateRequestDto} from '#dto/customers/customer-create-request.dto';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';
import {customers} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {createdAudit} from '../../../audit/audit-fields';
import {requireLocation} from '../../../user-context/require-location';
import {toCustomerResponseDto} from '../customer.mapper';

/** Adds a customer to the user's selected location: each location keeps its own customer book. */
@Injectable()
export class CreateCustomerCommandHandler implements ICreateCustomerCommandHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
  }

  public async executeAsync(userContext: UserContext, request: CustomerCreateRequestDto): Promise<CustomerResponseDto> {
    await using work = await this._unitOfWorkFactory.beginAsync();
    const [created] = await work.db
      .insert(customers)
      .values({
        locationId: requireLocation(userContext),
        firstName: request.firstName,
        surname: request.surname,
        companyName: request.companyName,
        email: request.email,
        phone: request.phone,
        city: request.city,
        status: request.status,
        lastContactDate: request.lastContactDate === null ? null : Temporal.PlainDate.from(request.lastContactDate),
        ...createdAudit(userContext.userId, this._clock.now()),
      })
      .returning();
    await work.commitAsync();
    return toCustomerResponseDto(created!);
  }
}
