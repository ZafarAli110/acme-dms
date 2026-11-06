import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { IGetRecentCustomersQueryHandler } from "#business-logic-abstractions/handlers/customers/get-recent/get-recent-customers.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerListItemDto } from "#dto/customers/customer-list-item.dto";
import { customers } from "#persistence/schema/customers";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { requireLocation } from "../../../user-context/require-location";
import { toCustomerListItemDto } from "../customer.mapper";

/** How many customers the "Recently contacted" panel on the home page shows. */
export const RECENT_CUSTOMERS_LIMIT = 5;

/**
 * The customers contacted most recently at the selected location, newest first, for the home page. Only this dealer's
 * and this location's: each rooftop keeps its own customer book (multi-tenancy.md).
 */
@Injectable()
export class GetRecentCustomersQueryHandler implements IGetRecentCustomersQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext): Promise<CustomerListItemDto[]> {
    const locationId = requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const recent = await work.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.dealerId, userContext.dealerId),
          eq(customers.locationId, locationId),
          isNotNull(customers.lastContactDate),
          notDeleted(customers),
        ),
      )
      // Ends with the id: two customers last contacted the same day with one surname keep their order.
      .orderBy(desc(customers.lastContactDate), asc(customers.surname), asc(customers.id))
      .limit(RECENT_CUSTOMERS_LIMIT);
    return recent.map(toCustomerListItemDto);
  }
}
