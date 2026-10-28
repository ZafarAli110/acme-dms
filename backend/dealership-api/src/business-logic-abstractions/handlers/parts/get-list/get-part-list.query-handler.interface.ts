import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PageQueryDto} from '#dto/paging/page-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {PartListItemDto} from '#dto/parts/part-list-item.dto';

export interface IGetPartListQueryHandler {
  executeAsync(userContext: UserContext, query: PageQueryDto): Promise<PageResponseDto<PartListItemDto>>;
}

export const GET_PART_LIST_QUERY_HANDLER = Symbol('IGetPartListQueryHandler');
