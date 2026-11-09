import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import type { PartCountResponseDto } from "#dto/parts/part-count-response.dto";

export interface ICountPartsQueryHandler {
  executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PartCountResponseDto>;
}

export const COUNT_PARTS_QUERY_HANDLER = Symbol("ICountPartsQueryHandler");
