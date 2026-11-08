import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerPageResponseDto } from "#dto/customers/customer-page-response.dto";
import type { ListQueryDto } from "#dto/paging/list-query.dto";

export interface IGetCustomerListQueryHandler {
  executeAsync(userContext: UserContext, query: ListQueryDto): Promise<CustomerPageResponseDto>;
}

export const GET_CUSTOMER_LIST_QUERY_HANDLER = Symbol("IGetCustomerListQueryHandler");
