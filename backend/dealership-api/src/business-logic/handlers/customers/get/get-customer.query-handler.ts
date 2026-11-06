import { localized } from "#i18n/messages";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { IGetCustomerQueryHandler } from "#business-logic-abstractions/handlers/customers/get/get-customer.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerResponseDto } from "#dto/customers/customer-response.dto";
import { customers } from "#persistence/schema/customers";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { requireLocation } from "../../../user-context/require-location";
import { toCustomerResponseDto } from "../customer.mapper";

/** A customer of the user's selected location; another location's customer is not found. */
@Injectable()
export class GetCustomerQueryHandler implements IGetCustomerQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext, customerId: string): Promise<CustomerResponseDto> {
    requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const [customer] = await work.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), notDeleted(customers)));
    if (!customer) {
      throw new NotFoundException(localized("errors.customerNotFound", { customerId }));
    }
    return toCustomerResponseDto(customer);
  }
}
