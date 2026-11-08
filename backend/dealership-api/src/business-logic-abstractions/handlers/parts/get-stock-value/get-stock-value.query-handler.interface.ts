import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { StockValueResponseDto } from "#dto/parts/stock-value-response.dto";

export interface IGetStockValueQueryHandler {
  executeAsync(userContext: UserContext): Promise<StockValueResponseDto>;
}

export const GET_STOCK_VALUE_QUERY_HANDLER = Symbol("IGetStockValueQueryHandler");
