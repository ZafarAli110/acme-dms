import { API_CONFIG } from "../config/api";
import { apiClient } from "../services/apiClient";

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
  /** Where the user starts after signing in: one of their locations. */
  defaultLocationId: string | null;
}

/** Sign-in and the signed-in user. Used by the auth kernel, outside React. */
export const identityQueries = {
  /** The access token to send with requests, and the refresh token that gets a new one when it expires. */
  signInAsync: (email: string, password: string) =>
    apiClient.postAsync<{ accessToken: string; tokenType: string; expiresIn: number; refreshToken: string }>(
      `${API_CONFIG.identityUrl}/v1/tokens`,
      { email, password },
    ),
  /** Signing out: ends the refresh token on the service. Best effort: the person is signed out here either way. */
  revokeAsync: (refreshToken: string): Promise<void> =>
    apiClient
      .postAsync<void>(
        `${API_CONFIG.identityUrl}/v1/tokens/revoke`,
        { refreshToken },
        { signal: AbortSignal.timeout(2000) },
      )
      .catch(() => undefined),
  getCurrentUserAsync: () => apiClient.getAsync<CurrentUser>(`${API_CONFIG.identityUrl}/v1/users/me`),
};
