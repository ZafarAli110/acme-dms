import { API_CONFIG } from "../../../core/config/api";
import { apiClient, type RequestOptions } from "../../../core/services/apiClient";
import type { ListTotal } from "../../../core/types/listTotal";
import { FIRST_PAGE, type ListParams, toListApiQuery, toListSearchParams } from "../../../core/paging/listParams";
import type { Bin, Part, PartInput, PartPage, PartQuestion, StockValue } from "../types/part";
import { idempotencyKey, ifMatch } from "../../../core/services/ifMatch";

const PARTS_URL = `${API_CONFIG.dealershipUrl}/v1/parts`;

/** The parts API. Parts are read and written at the selected location (sent by the API client). */
export const partQueries = {
  /** One page of the list, searched, sorted and filtered as `params` says. */
  getPartsAsync: (params: ListParams, options?: RequestOptions) =>
    apiClient.getAsync<PartPage>(`${PARTS_URL}?${toListApiQuery(params)}`, options),
  /** How many parts the search and filter match at the location, exactly. */
  countPartsAsync: (question: PartQuestion, options?: RequestOptions) =>
    apiClient.getAsync<ListTotal>(`${PARTS_URL}/count?${toListSearchParams({ ...FIRST_PAGE, ...question })}`, options),
  /** What the location's stock is worth: every part, not only the page shown. */
  getStockValueAsync: (options?: RequestOptions) => apiClient.getAsync<StockValue>(`${PARTS_URL}/stock-value`, options),
  getPartAsync: (partId: string, options?: RequestOptions) =>
    apiClient.getAsync<Part>(`${PARTS_URL}/${partId}`, options),
  /** Done once per `saveKey`: the same save sent again is answered with the first (ACME-125). */
  createPartAsync: (input: PartInput, saveKey: string) =>
    apiClient.postAsync<Part>(PARTS_URL, input, { headers: idempotencyKey(saveKey) }),
  /**
   * One Save of the part page: a multipart PATCH with the changes as JSON in `payload` and the new photos as `photos`
   * files (built by mappers/partFormMapper.ts). The service saves the part and its photos together or not at all, and
   * once per `saveKey` (ACME-125).
   */
  updatePartAsync: (partId: string, form: FormData, version: number, saveKey: string, locationId?: string) =>
    apiClient.patchFormAsync<Part>(`${PARTS_URL}/${partId}`, form, {
      headers: { ...ifMatch(version), ...idempotencyKey(saveKey) },
      locationId,
    }),
  getBinsAsync: (options?: RequestOptions) => apiClient.getAsync<Bin[]>(`${API_CONFIG.dealershipUrl}/v1/bins`, options),
};
