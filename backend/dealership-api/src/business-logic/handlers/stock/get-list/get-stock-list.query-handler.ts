import {Inject, Injectable} from '@nestjs/common';
import type {IGetStockListQueryHandler} from '#business-logic-abstractions/handlers/stock/get-list/get-stock-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PageQueryDto} from '#dto/paging/page-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';
import {
  type IPartInventoryRepository,
  PART_INVENTORY_REPOSITORY,
} from '#persistence/repositories/part-inventory.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toStockListItemDto} from '../stock.mapper';

/** Stock at the user's selected location. Stock is per location: never mix locations in one answer. */
@Injectable()
export class GetStockListQueryHandler implements IGetStockListQueryHandler {
  private readonly _partInventoryRepository: IPartInventoryRepository;

  public constructor(@Inject(PART_INVENTORY_REPOSITORY) partInventoryRepository: IPartInventoryRepository) {
    this._partInventoryRepository = partInventoryRepository;
  }

  public async executeAsync(userContext: UserContext, query: PageQueryDto): Promise<PageResponseDto<StockListItemDto>> {
    const locationId = requireLocation(userContext);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const {items, total} = await this._partInventoryRepository.findPageForLocationAsync(
      userContext.dealerId,
      locationId,
      query.search ?? null,
      page,
      pageSize,
    );
    return {
      items: items.map(({part, inventory, bin}) => toStockListItemDto(part, inventory, bin)),
      total,
      page,
      pageSize,
    };
  }
}
