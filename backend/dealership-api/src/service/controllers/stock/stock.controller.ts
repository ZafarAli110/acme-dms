import {Controller, Get, Inject, Query} from '@nestjs/common';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {
  GET_STOCK_LIST_QUERY_HANDLER,
  type IGetStockListQueryHandler,
} from '#business-logic-abstractions/handlers/stock/get-list/get-stock-list.query-handler.interface';
import {ListQueryDto} from '#dto/paging/list-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';

/** Reads of stock at the location selected in `x-location-id`. Writes are in StockCommandController. */
@Controller('v1/stock')
export class StockController {
  private readonly _getStockListQueryHandler: IGetStockListQueryHandler;

  public constructor(@Inject(GET_STOCK_LIST_QUERY_HANDLER) getStockListQueryHandler: IGetStockListQueryHandler) {
    this._getStockListQueryHandler = getStockListQueryHandler;
  }

  @Get()
  @RequirePermission('stock.read')
  public findAllAsync(
    @CurrentUser() userContext: UserContext,
    @Query() query: ListQueryDto,
  ): Promise<PageResponseDto<StockListItemDto>> {
    return this._getStockListQueryHandler.executeAsync(userContext, query);
  }
}
