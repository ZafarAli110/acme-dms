import { Inject, Injectable } from "@nestjs/common";
import type { ICountPartsQueryHandler } from "#business-logic-abstractions/handlers/parts/count/count-parts.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import type { PartCountResponseDto } from "#dto/parts/part-count-response.dto";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { MAX_EXACT_TOTAL } from "#dto/paging/list-total.dto";
import { MAX_LIST_DEPTH } from "../../../list-query/page-offset";
import { requireLocation } from "../../../user-context/require-location";
import { countMatchingPartsAsync, countStockedPartsAsync, estimateStockedPartsAsync } from "../part.queries";

/**
 * How many parts the list's search and filter match at the user's location, as customers say it (ACME-129): the whole
 * list "about" a number from the statistics when big, counted when small (counting Northside's 24,221 took 30 ms a
 * question); a search or a filter exact up to 100, else "many". The web asks once per question (ACME-124). Counted as
 * the list finds its rows: a search as the tables' owner with the scope written out (ACME-123), the rest under the policy.
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
    if (!search && !query.filterField) {
      const about = await estimateStockedPartsAsync(work.db);
      if (about > MAX_LIST_DEPTH) {
        return { kind: "about", value: about };
      }
      const counted = await countStockedPartsAsync(work.db, query, 2 * MAX_LIST_DEPTH + 1);
      return counted > 2 * MAX_LIST_DEPTH ? { kind: "about", value: counted } : { kind: "exact", value: counted };
    }
    const found = search
      ? await countMatchingPartsAsync(
          work.db,
          { dealerId: userContext.dealerId, locationId },
          query,
          search,
          MAX_EXACT_TOTAL + 1,
        )
      : await countStockedPartsAsync(work.db, query, MAX_EXACT_TOTAL + 1);
    return found > MAX_EXACT_TOTAL ? { kind: "many", value: null } : { kind: "exact", value: found };
  }
}
