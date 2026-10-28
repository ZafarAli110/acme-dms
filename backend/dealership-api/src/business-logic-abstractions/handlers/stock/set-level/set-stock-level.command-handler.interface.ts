import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {StockLevelSetRequestDto} from '#dto/stock/stock-level-set-request.dto';
import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';

export interface ISetStockLevelCommandHandler {
  executeAsync(userContext: UserContext, partId: string, request: StockLevelSetRequestDto): Promise<StockListItemDto>;
}

export const SET_STOCK_LEVEL_COMMAND_HANDLER = Symbol('ISetStockLevelCommandHandler');
