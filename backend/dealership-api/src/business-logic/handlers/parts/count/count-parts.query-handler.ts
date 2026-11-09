import { Inject, Injectable } from "@nestjs/common";
import type { ICountPartsQueryHandler } from "#business-logic-abstractions/handlers/parts/count/count-parts.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import type { PartCountResponseDto } from "#dto/parts/part-count-response.dto";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { requireLocation } from "../../../user-context/require-location";
import { countMatchingPartsAsync, countStockedPartsAsync } from "../part.queries";

/**
 * How many parts the list's search and filter match at the user's location, exactly. The web asks once per question
 * and keeps it while the pages change (ACME-124); the page, the page size and the sort are ignored. Counted as the list
 * finds its rows: a search as the tables' owner with the scope written out (ACME-123), anything else under the policy.
 */
@Injectable()
export class CountPartsQueryHandler implements ICountPartsQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PartCountResponseDto> {
    const locationId = requireLocation(userContext);
    const search = query.search;
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner: Boolean(search) });
    const total = search
      ? await countMatchingPartsAsync(work.db, { dealerId: userContext.dealerId, locationId }, query, search)
      : await countStockedPartsAsync(work.db, query);
    return { total };
  }
}
