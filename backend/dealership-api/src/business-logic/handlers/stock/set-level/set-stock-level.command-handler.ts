import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import type {ISetStockLevelCommandHandler} from '#business-logic-abstractions/handlers/stock/set-level/set-stock-level.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {createdAudit, updatedAudit} from '../../../audit/audit-fields';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {StockLevelSetRequestDto} from '#dto/stock/stock-level-set-request.dto';
import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';
import type {NewEntity} from '#persistence/entities/generated-id';
import type {PartInventory} from '#persistence/entities/part-inventory.entity';
import {BIN_REPOSITORY, type IBinRepository} from '#persistence/repositories/bin.repository.interface';
import {
  type IPartInventoryRepository,
  PART_INVENTORY_REPOSITORY,
} from '#persistence/repositories/part-inventory.repository.interface';
import {type IPartRepository, PART_REPOSITORY} from '#persistence/repositories/part.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toStockListItemDto} from '../stock.mapper';

/**
 * Sets a part's bin and quantity at the user's selected location. A catalogue part the location does not stock yet
 * becomes stocked there.
 */
@Injectable()
export class SetStockLevelCommandHandler implements ISetStockLevelCommandHandler {
  private readonly _partRepository: IPartRepository;
  private readonly _partInventoryRepository: IPartInventoryRepository;
  private readonly _binRepository: IBinRepository;
  private readonly _clock: IClock;

  public constructor(
    @Inject(PART_REPOSITORY) partRepository: IPartRepository,
    @Inject(PART_INVENTORY_REPOSITORY) partInventoryRepository: IPartInventoryRepository,
    @Inject(BIN_REPOSITORY) binRepository: IBinRepository,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._partRepository = partRepository;
    this._partInventoryRepository = partInventoryRepository;
    this._binRepository = binRepository;
    this._clock = clock;
  }

  public async executeAsync(
    userContext: UserContext,
    partId: string,
    request: StockLevelSetRequestDto,
  ): Promise<StockListItemDto> {
    const locationId = requireLocation(userContext);
    const part = await this._partRepository.findByIdAsync(userContext.dealerId, partId);
    if (!part) {
      throw new NotFoundException(`Part ${partId} was not found.`);
    }
    const bin = await this._binRepository.findByIdAsync(userContext.dealerId, locationId, request.binId);
    if (!bin) {
      throw new BadRequestException(`Bin ${request.binId} is not a bin of this location; pick one from GET /v1/bins.`);
    }

    const existing = await this._partInventoryRepository.findForPartAsync(userContext.dealerId, locationId, partId);
    const now = this._clock.now();
    const levels = {binId: bin.id, quantityOnHand: request.quantityOnHand, reorderLevel: request.reorderLevel};
    // Stocking the part here for the first time creates its inventory at this location.
    const inventory: PartInventory | NewEntity<PartInventory> = existing
      ? {...existing.inventory, ...levels, ...updatedAudit(userContext.userId, now)}
      : {
          dealerId: userContext.dealerId,
          locationId,
          partId,
          ...levels,
          ...createdAudit(userContext.userId, now),
        };
    const saved = await this._partInventoryRepository.saveAsync(userContext.dealerId, inventory);
    return toStockListItemDto(part, saved, bin);
  }
}
