import {Body, Controller, Inject, Param, ParseUUIDPipe, Put} from '@nestjs/common';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {
  type ISetStockLevelCommandHandler,
  SET_STOCK_LEVEL_COMMAND_HANDLER,
} from '#business-logic-abstractions/handlers/stock/set-level/set-stock-level.command-handler.interface';
import {StockLevelSetRequestDto} from '#dto/stock/stock-level-set-request.dto';
import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';

/** Changes to stock at the location selected in `x-location-id`. Reads are in StockController. */
@Controller('v1/stock')
export class StockCommandController {
  private readonly _setStockLevelCommandHandler: ISetStockLevelCommandHandler;

  public constructor(
    @Inject(SET_STOCK_LEVEL_COMMAND_HANDLER) setStockLevelCommandHandler: ISetStockLevelCommandHandler,
  ) {
    this._setStockLevelCommandHandler = setStockLevelCommandHandler;
  }

  /** Sets the stock of one part at the selected location. */
  @Put(':partId')
  @RequirePermission('stock.adjust')
  public updateAsync(
    @CurrentUser() userContext: UserContext,
    @Param('partId', ParseUUIDPipe) partId: string,
    @Body() request: StockLevelSetRequestDto,
  ): Promise<StockListItemDto> {
    return this._setStockLevelCommandHandler.executeAsync(userContext, partId, request);
  }
}
