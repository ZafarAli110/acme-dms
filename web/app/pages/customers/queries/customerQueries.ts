import { API_CONFIG } from "../../../core/config/api";
import { apiClient, type RequestOptions } from "../../../core/services/apiClient";
import { FIRST_PAGE, type ListParams, toListApiQuery, toListSearchParams } from "../../../core/paging/listParams";
import type { Customer, CustomerInput, CustomerListItem, CustomerPage, CustomerQuestion } from "../types/customer";
import { ifMatch } from "../../../core/services/ifMatch";

const CUSTOMERS_URL = `${API_CONFIG.dealershipUrl}/v1/customers`;

/** The customers API. Customers belong to the selected location (sent by the API client). */
export const customerQueries = {
  /** One page of the list, searched, sorted and filtered as `params` says. */
  getCustomersAsync: (params: ListParams, options?: RequestOptions) =>
    apiClient.getAsync<CustomerPage>(`${CUSTOMERS_URL}?${toListApiQuery(params)}`, options),
  /** How many customers the search and filter match: exact up to 10,000, 10,001 past it ("10,000+"). */
  countCustomersAsync: (question: CustomerQuestion, options?: RequestOptions) =>
    apiClient.getAsync<{ total: number }>(
      `${CUSTOMERS_URL}/count?${toListSearchParams({ ...FIRST_PAGE, ...question })}`,
      options,
    ),
  getRecentCustomersAsync: (options?: RequestOptions) =>
    apiClient.getAsync<CustomerListItem[]>(`${CUSTOMERS_URL}/recent`, options),
  getCustomerAsync: (customerId: string, options?: RequestOptions) =>
    apiClient.getAsync<Customer>(`${CUSTOMERS_URL}/${customerId}`, options),
  createCustomerAsync: (input: CustomerInput) => apiClient.postAsync<Customer>(CUSTOMERS_URL, input),
  /** PUT: every field is sent, from `version` (If-Match): a newer version saved meanwhile answers 412. */
  updateCustomerAsync: (customerId: string, input: CustomerInput, version: number, locationId?: string) =>
    apiClient.putAsync<Customer>(`${CUSTOMERS_URL}/${customerId}`, input, { headers: ifMatch(version), locationId }),
};
