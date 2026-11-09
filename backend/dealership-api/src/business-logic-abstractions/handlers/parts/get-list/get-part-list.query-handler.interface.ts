import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import type { PartPageResponseDto } from "#dto/parts/part-page-response.dto";

export interface IGetPartListQueryHandler {
  executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PartPageResponseDto>;
}

export const GET_PART_LIST_QUERY_HANDLER = Symbol("IGetPartListQueryHandler");
