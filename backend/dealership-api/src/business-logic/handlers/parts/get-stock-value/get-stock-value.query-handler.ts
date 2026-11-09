import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { IGetStockValueQueryHandler } from "#business-logic-abstractions/handlers/parts/get-stock-value/get-stock-value.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { StockValueResponseDto } from "#dto/parts/stock-value-response.dto";
import { centsFromDecimalText } from "#persistence/schema/columns/money-column";
import { partInventories } from "#persistence/schema/part-inventories";
import { parts } from "#persistence/schema/parts";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { requireLocation } from "../../../user-context/require-location";
import { liveBinStock } from "../part.queries";

/**
 * What the stock at the user's selected location is worth: the sum of on hand × price over every part stocked there in
 * a live bin, the rows the list shows (row-level security picks the dealer, the location and live rows; ACME-124).
 * Summed by Postgres in `numeric`, which is exact, and read as text: never every row loaded to be added up here
 * (docs/standards/money.md, rule 7). Worked out on every visit, always current.
 */
@Injectable()
export class GetStockValueQueryHandler implements IGetStockValueQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext): Promise<StockValueResponseDto> {
    requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const [row] = await work.db
      .select({
        total: sql<string>`coalesce(sum(${partInventories.quantityOnHand} * ${parts.unitPriceCents}), 0)::text`,
      })
      .from(partInventories)
      .innerJoin(parts, eq(parts.id, partInventories.partId))
      .where(liveBinStock(work.db));
    return { stockValueCents: centsFromDecimalText(row?.total ?? "0") };
  }
}
