import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerCountResponseDto } from "#dto/customers/customer-count-response.dto";
import type { ListQueryDto } from "#dto/paging/list-query.dto";

export interface ICountCustomersQueryHandler {
  executeAsync(userContext: UserContext, query: ListQueryDto): Promise<CustomerCountResponseDto>;
}

export const COUNT_CUSTOMERS_QUERY_HANDLER = Symbol("ICountCustomersQueryHandler");
