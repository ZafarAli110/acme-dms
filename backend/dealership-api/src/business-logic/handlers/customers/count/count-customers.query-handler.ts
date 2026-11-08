import { Inject, Injectable } from "@nestjs/common";
import type { ICountCustomersQueryHandler } from "#business-logic-abstractions/handlers/customers/count/count-customers.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerCountResponseDto } from "#dto/customers/customer-count-response.dto";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { matchesText } from "../../../list-query/list-columns";
import { requireLocation } from "../../../user-context/require-location";
import {
  CUSTOMER_LIST_COLUMNS,
  countUpToDepthAsync,
  customerListWhere,
  ownerScoped,
} from "../get-list/get-customer-list.query-handler";

/**
 * How many customers the list's search and filter match, at the user's location: exact up to 10,000, 10,001 past it
 * ("10,000+"). The web asks once per question and keeps it while the pages change (ACME-117); the page, the page size
 * and the sort are ignored. Counted as the list finds its ids: a search or a text filter as the table's owner with the
 * scope written out (no index could serve their ILIKE under row-level security), anything else under the policy.
 */
@Injectable()
export class CountCustomersQueryHandler implements ICountCustomersQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext, query: ListQueryDto): Promise<CustomerCountResponseDto> {
    const locationId = requireLocation(userContext);
    const where = customerListWhere(query);
    const asOwner = Boolean(query.search) || matchesText(CUSTOMER_LIST_COLUMNS, query);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner });
    const total = await countUpToDepthAsync(
      work.db,
      asOwner ? ownerScoped(userContext.dealerId, locationId, where) : where,
    );
    return { total };
  }
}
