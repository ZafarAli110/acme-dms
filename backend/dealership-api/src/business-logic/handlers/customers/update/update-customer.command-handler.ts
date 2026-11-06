import { localized } from "#i18n/messages";
import { Inject, Injectable, NotFoundException, PreconditionFailedException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { IUpdateCustomerCommandHandler } from "#business-logic-abstractions/handlers/customers/update/update-customer.command-handler.interface";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerResponseDto } from "#dto/customers/customer-response.dto";
import type { CustomerUpdateRequestDto } from "#dto/customers/customer-update-request.dto";
import { customers } from "#persistence/schema/customers";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { updatedAudit } from "../../../audit/audit-fields";
import { requireLocation } from "../../../user-context/require-location";
import { toCustomerResponseDto } from "../customer.mapper";

/** Replaces a customer's details (PUT: every field is sent); the customer must belong to the selected location. */
@Injectable()
export class UpdateCustomerCommandHandler implements IUpdateCustomerCommandHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
  }

  public async executeAsync(
    userContext: UserContext,
    customerId: string,
    request: CustomerUpdateRequestDto,
    expectedVersion: number | null,
  ): Promise<CustomerResponseDto> {
    const locationId = requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync();
    const isThisCustomer = and(
      eq(customers.id, customerId),
      eq(customers.dealerId, userContext.dealerId),
      eq(customers.locationId, locationId),
      notDeleted(customers),
    );
    // PUT: every field comes from the request; identity, location and creation stay as they were. Only from the
    // version the save started from, in the same statement, so two saves can never both win.
    const [updated] = await work.db
      .update(customers)
      .set({
        firstName: request.firstName,
        surname: request.surname,
        companyName: request.companyName,
        email: request.email,
        phone: request.phone,
        city: request.city,
        status: request.status,
        lastContactDate: request.lastContactDate === null ? null : Temporal.PlainDate.from(request.lastContactDate),
        version: sql`${customers.version} + 1`,
        ...updatedAudit(userContext.userId, this._clock.now()),
      })
      .where(and(isThisCustomer, ...(expectedVersion === null ? [] : [eq(customers.version, expectedVersion)])))
      .returning();
    if (!updated) {
      // Nothing changed: either there is no such customer here, or someone saved a newer version first.
      const [current] = await work.db.select({ id: customers.id }).from(customers).where(isThisCustomer);
      throw current
        ? new PreconditionFailedException(localized("errors.customerChangedByOthers"))
        : new NotFoundException(localized("errors.customerNotFound", { customerId }));
    }
    await work.commitAsync();
    return toCustomerResponseDto(updated);
  }
}
