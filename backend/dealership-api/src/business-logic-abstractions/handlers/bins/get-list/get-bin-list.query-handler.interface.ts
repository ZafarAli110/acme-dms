import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {BinResponseDto} from '#dto/bins/bin-response.dto';

export interface IGetBinListQueryHandler {
  executeAsync(userContext: UserContext): Promise<BinResponseDto[]>;
}

export const GET_BIN_LIST_QUERY_HANDLER = Symbol('IGetBinListQueryHandler');
