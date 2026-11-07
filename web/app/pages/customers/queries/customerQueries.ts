import { API_CONFIG } from "../../../core/config/api";
import { apiClient, type RequestOptions } from "../../../core/services/apiClient";
import { type ListParams, toListApiQuery } from "../../../core/paging/listParams";
import type { Page } from "../../../core/types/page";
import type { Customer, CustomerInput, CustomerListItem } from "../types/customer";
import { ifMatch } from "../../../core/services/ifMatch";

const CUSTOMERS_URL = `${API_CONFIG.dealershipUrl}/v1/customers`;

/** The customers API. Customers belong to the selected location (sent by the API client). */
export const customerQueries = {
  /** One page of the list, searched, sorted and filtered as `params` says. */
  getCustomersAsync: (params: ListParams, options?: RequestOptions) =>
    apiClient.getAsync<Page<CustomerListItem>>(`${CUSTOMERS_URL}?${toListApiQuery(params)}`, options),
  getRecentCustomersAsync: (options?: RequestOptions) =>
    apiClient.getAsync<CustomerListItem[]>(`${CUSTOMERS_URL}/recent`, options),
  getCustomerAsync: (customerId: string, options?: RequestOptions) =>
    apiClient.getAsync<Customer>(`${CUSTOMERS_URL}/${customerId}`, options),
  createCustomerAsync: (input: CustomerInput) => apiClient.postAsync<Customer>(CUSTOMERS_URL, input),
  /** PUT: every field is sent, from `version` (If-Match): a newer version saved meanwhile answers 412. */
  updateCustomerAsync: (customerId: string, input: CustomerInput, version: number, locationId?: string) =>
    apiClient.putAsync<Customer>(`${CUSTOMERS_URL}/${customerId}`, input, { headers: ifMatch(version), locationId }),
};
