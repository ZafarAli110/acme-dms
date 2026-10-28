import {API_CONFIG} from '../config/api';
import {apiClient} from '../services/apiClient';

export interface UserLocation {
  id: string;
  code: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  dealerId: string;
  dealerName: string;
  locations: UserLocation[];
}

/** Sign-in and the signed-in user. Used by the auth kernel, outside React. */
export const identityQueries = {
  signInAsync: (email: string, password: string) =>
    apiClient.postAsync<{accessToken: string; tokenType: string; expiresIn: number}>(
      `${API_CONFIG.identityUrl}/v1/tokens`,
      {email, password},
    ),
  getCurrentUserAsync: () => apiClient.getAsync<CurrentUser>(`${API_CONFIG.identityUrl}/v1/users/me`),
};
