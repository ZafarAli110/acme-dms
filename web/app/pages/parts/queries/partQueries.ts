import {API_CONFIG} from '../../../core/config/api';
import {apiClient, type RequestOptions} from '../../../core/services/apiClient';
import {type ListParams, toListApiQuery} from '../../../core/paging/listParams';
import type {Page} from '../../../core/types/page';
import type {Bin, Part, PartInput, PartListItem} from '../types/part';

const PARTS_URL = `${API_CONFIG.dealershipUrl}/v1/parts`;

/** The parts API. Parts are read and written at the selected location (sent by the API client). */
export const partQueries = {
  /** One page of the list, searched, sorted and filtered as `params` says. */
  getPartsAsync: (params: ListParams, options?: RequestOptions) =>
    apiClient.getAsync<Page<PartListItem>>(`${PARTS_URL}?${toListApiQuery(params)}`, options),
  getPartAsync: (partId: string, options?: RequestOptions) =>
    apiClient.getAsync<Part>(`${PARTS_URL}/${partId}`, options),
  createPartAsync: (input: PartInput) => apiClient.postAsync<Part>(PARTS_URL, input),
  /**
   * One Save of the part page: a multipart PATCH with the changes as JSON in `payload` and the new photos as `photos`
   * files (built by mappers/partFormMapper.ts). The service saves the part and its photos together or not at all.
   */
  updatePartAsync: (partId: string, form: FormData) => apiClient.patchFormAsync<Part>(`${PARTS_URL}/${partId}`, form),
  getBinsAsync: (options?: RequestOptions) => apiClient.getAsync<Bin[]>(`${API_CONFIG.dealershipUrl}/v1/bins`, options),
};
