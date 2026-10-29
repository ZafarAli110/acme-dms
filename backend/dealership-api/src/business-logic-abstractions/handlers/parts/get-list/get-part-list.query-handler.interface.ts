import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ListQueryDto} from '#dto/paging/list-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {PartListItemDto} from '#dto/parts/part-list-item.dto';

export interface IGetPartListQueryHandler {
  executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PageResponseDto<PartListItemDto>>;
}

export const GET_PART_LIST_QUERY_HANDLER = Symbol('IGetPartListQueryHandler');
