import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {and, eq} from 'drizzle-orm';
import type {ISetStockLevelCommandHandler} from '#business-logic-abstractions/handlers/stock/set-level/set-stock-level.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {StockLevelSetRequestDto} from '#dto/stock/stock-level-set-request.dto';
import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';
import {bins, notDeleted, partInventories, parts} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {createdAudit, updatedAudit} from '../../../audit/audit-fields';
import {requireLocation} from '../../../user-context/require-location';
import {findStockedPartAsync} from '../../parts/part.queries';
import {toStockListItemDto} from '../stock.mapper';

/**
 * Sets a part's bin and quantity at the user's selected location. A catalogue part the location does not stock yet
 * becomes stocked there.
 */
@Injectable()
export class SetStockLevelCommandHandler implements ISetStockLevelCommandHandler {
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
    partId: string,
    request: StockLevelSetRequestDto,
  ): Promise<StockListItemDto> {
    const locationId = requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync();
    const [part] = await work.db
      .select()
      .from(parts)
      .where(and(eq(parts.id, partId), notDeleted(parts)));
    if (!part) {
      throw new NotFoundException(`Part ${partId} was not found.`);
    }
    const [bin] = await work.db
      .select()
      .from(bins)
      .where(and(eq(bins.id, request.binId), eq(bins.locationId, locationId), notDeleted(bins)));
    if (!bin) {
      throw new BadRequestException(`Bin ${request.binId} is not a bin of this location; pick one from GET /v1/bins.`);
    }

    const now = this._clock.now();
    const levels = {binId: bin.id, quantityOnHand: request.quantityOnHand, reorderLevel: request.reorderLevel};
    const existing = await findStockedPartAsync(work.db, locationId, partId);
    // Stocking the part here for the first time creates its inventory at this location.
    const [inventory] = existing
      ? await work.db
          .update(partInventories)
          .set({...levels, ...updatedAudit(userContext.userId, now)})
          .where(eq(partInventories.id, existing.inventory.id))
          .returning()
      : await work.db
          .insert(partInventories)
          .values({locationId, partId, ...levels, ...createdAudit(userContext.userId, now)})
          .returning();
    await work.commitAsync();
    return toStockListItemDto(part, inventory!, bin);
  }
}
