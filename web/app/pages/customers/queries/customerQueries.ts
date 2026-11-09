import { API_CONFIG } from "../../../core/config/api";
import { apiClient, type RequestOptions } from "../../../core/services/apiClient";
import type { ListTotal } from "../../../core/types/listTotal";
import { FIRST_PAGE, type ListParams, toListApiQuery, toListSearchParams } from "../../../core/paging/listParams";
import type { Customer, CustomerInput, CustomerListItem, CustomerPage, CustomerQuestion } from "../types/customer";
import { idempotencyKey, ifMatch } from "../../../core/services/ifMatch";

const CUSTOMERS_URL = `${API_CONFIG.dealershipUrl}/v1/customers`;

/** The customers API. Customers belong to the selected location (sent by the API client). */
export const customerQueries = {
  /** One page of the list, searched, sorted and filtered as `params` says. */
  getCustomersAsync: (params: ListParams, options?: RequestOptions) =>
    apiClient.getAsync<CustomerPage>(`${CUSTOMERS_URL}?${toListApiQuery(params)}`, options),
  /** How many customers the search and filter match: exact up to 10,000, 10,001 past it ("10,000+"). */
  countCustomersAsync: (question: CustomerQuestion, options?: RequestOptions) =>
    apiClient.getAsync<ListTotal>(
      `${CUSTOMERS_URL}/count?${toListSearchParams({ ...FIRST_PAGE, ...question })}`,
      options,
    ),
  getRecentCustomersAsync: (options?: RequestOptions) =>
    apiClient.getAsync<CustomerListItem[]>(`${CUSTOMERS_URL}/recent`, options),
  getCustomerAsync: (customerId: string, options?: RequestOptions) =>
    apiClient.getAsync<Customer>(`${CUSTOMERS_URL}/${customerId}`, options),
  /** Done once per `saveKey`: the same save sent again is answered with the first (ACME-125). */
  createCustomerAsync: (input: CustomerInput, saveKey: string) =>
    apiClient.postAsync<Customer>(CUSTOMERS_URL, input, { headers: idempotencyKey(saveKey) }),
  /**
   * PUT: every field is sent, from `version` (If-Match): a newer version saved meanwhile answers 412. Done once per
   * `saveKey`, so a save sent again after a lost answer is never refused as someone else's (ACME-125).
   */
  updateCustomerAsync: (
    customerId: string,
    input: CustomerInput,
    version: number,
    saveKey: string,
    locationId?: string,
  ) =>
    apiClient.putAsync<Customer>(`${CUSTOMERS_URL}/${customerId}`, input, {
      headers: { ...ifMatch(version), ...idempotencyKey(saveKey) },
      locationId,
    }),
};
