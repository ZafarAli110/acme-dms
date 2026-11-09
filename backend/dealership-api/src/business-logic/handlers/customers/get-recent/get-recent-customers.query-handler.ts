import { Inject, Injectable } from "@nestjs/common";
import { and, desc, isNotNull } from "drizzle-orm";
import type { IGetRecentCustomersQueryHandler } from "#business-logic-abstractions/handlers/customers/get-recent/get-recent-customers.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerListItemDto } from "#dto/customers/customer-list-item.dto";
import { customers } from "#persistence/schema/customers";
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
    requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const recent = await work.db
      .select()
      .from(customers)
      .where(and(isNotNull(customers.lastContactDate)))
      // The last-contact index's own order, read backwards: newest day first, then the newest id (ACME-129). A tie
      // sorted by surname read every customer of the latest day first (149,452 at Northside).
      .orderBy(desc(customers.lastContactDate), desc(customers.id))
      .limit(RECENT_CUSTOMERS_LIMIT);
    return recent.map(toCustomerListItemDto);
  }
}
