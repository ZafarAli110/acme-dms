import {API_CONFIG} from '../../../core/config/api';
import {apiClient, type RequestOptions} from '../../../core/services/apiClient';
import type {DealerLocation, DealerUser} from '../types/dealerUser';

const USERS_URL = `${API_CONFIG.identityUrl}/v1/users`;

/** identity-api, for someone who may manage users (`users.manage`) at the selected location. */
export const locationQueries = {
  getUsersAsync: (options?: RequestOptions) => apiClient.getAsync<DealerUser[]>(USERS_URL, options),
  getLocationsAsync: (options?: RequestOptions) =>
    apiClient.getAsync<DealerLocation[]>(`${API_CONFIG.identityUrl}/v1/locations`, options),
  assignAsync: (userId: string, locationId: string) =>
    apiClient.putAsync<DealerUser>(`${USERS_URL}/${userId}/locations/${locationId}`, null),
  unassignAsync: (userId: string, locationId: string) =>
    apiClient.deleteAsync<DealerUser>(`${USERS_URL}/${userId}/locations/${locationId}`),
};
