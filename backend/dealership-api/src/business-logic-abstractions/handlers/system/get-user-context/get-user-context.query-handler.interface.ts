import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {UserContextResponseDto} from '#dto/system/user-context-response.dto';

export interface IGetUserContextQueryHandler {
  executeAsync(userContext: UserContext): Promise<UserContextResponseDto>;
}

export const GET_USER_CONTEXT_QUERY_HANDLER = Symbol('IGetUserContextQueryHandler');
