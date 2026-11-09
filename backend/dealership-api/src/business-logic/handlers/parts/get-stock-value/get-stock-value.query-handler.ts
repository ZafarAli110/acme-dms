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
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import { runDetachedFromCaller } from "#request-scope/data-scope";
import { TtlCache } from "../../../cache/ttl-cache";
import { requireLocation } from "../../../user-context/require-location";
import { liveBinStock } from "../part.queries";

/**
 * What the stock at the user's selected location is worth: the sum of on hand × price over every part stocked there in
 * a live bin, the rows the list shows (row-level security picks the dealer, the location and live rows; ACME-124).
 * Summed by Postgres in `numeric`, which is exact, and read as text: never every row loaded to be added up here
 * (docs/standards/money.md, rule 7).
 *
 * At most 10 seconds old (ACME-129): each API instance sums a location at most once in that time, however many open the
 * parts list, by the dealer and the location (a key without either could show one location another's value). Summed on
 * every visit, it was 6% of the database's work on a busy morning, at 20 ms a time at Northside. A part's own stock
 * shows a change at once; only this total waits.
 */
/** How old the location's stock value may be (Zafar Ali, 9 Nov). */
export const STOCK_VALUE_TTL_MS = 10_000;

@Injectable()
export class GetStockValueQueryHandler implements IGetStockValueQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  private readonly _values: TtlCache<StockValueResponseDto>;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._values = new TtlCache(clock, STOCK_VALUE_TTL_MS);
  }

  public executeAsync(userContext: UserContext): Promise<StockValueResponseDto> {
    const locationId = requireLocation(userContext);
    // One sum shared by every caller asking while it runs: run apart from this caller's request, so its leaving does
    // not cancel the others' answer.
    return this._values.getAsync(`${userContext.dealerId}:${locationId}`, () =>
      runDetachedFromCaller(() => this.sumAsync()),
    );
  }

  private async sumAsync(): Promise<StockValueResponseDto> {
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
