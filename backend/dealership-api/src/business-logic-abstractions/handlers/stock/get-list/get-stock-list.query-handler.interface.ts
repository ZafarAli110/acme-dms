import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ListQueryDto} from '#dto/paging/list-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';

export interface IGetStockListQueryHandler {
  executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PageResponseDto<StockListItemDto>>;
}

export const GET_STOCK_LIST_QUERY_HANDLER = Symbol('IGetStockListQueryHandler');
