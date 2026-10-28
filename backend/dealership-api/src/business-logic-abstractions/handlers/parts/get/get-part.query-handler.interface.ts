import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartResponseDto} from '#dto/parts/part-response.dto';

export interface IGetPartQueryHandler {
  executeAsync(userContext: UserContext, partId: string): Promise<PartResponseDto>;
}

export const GET_PART_QUERY_HANDLER = Symbol('IGetPartQueryHandler');
