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

/** What the gateway says about this browser's sign-in, without asking a service who it is. */
export interface SessionStatus {
  isSignedIn: boolean;
}

/** Sign-in and the signed-in user. Used by the auth kernel, outside React. */
export const identityQueries = {
  /**
   * Signs in at the gateway, which checks the password at identity-api and answers with a session cookie: httpOnly, so this
   * code never sees it, and no token comes back at all. Throws the problem (401) for a wrong email or password.
   */
  signInAsync: (email: string, password: string): Promise<void> =>
    apiClient.postAsync<void>(API_CONFIG.sessionUrl, { email, password }, { anonymous: true }),
  /** Signing out: the gateway ends the sign-in and removes the cookie. True when the gateway answered. */
  revokeAsync: (): Promise<boolean> => apiClient.signOutAsync(),
  /** Whether the session cookie signs someone in: 200 either way, so a signed-out visit logs no error. */
  getSessionAsync: () => apiClient.getAsync<SessionStatus>(API_CONFIG.sessionUrl, { anonymous: true }),
  /** Asks the browser to drop what it cached; nobody waits for it. */
  forgetCache: (): void => apiClient.forgetCache(),
  getCurrentUserAsync: () => apiClient.getAsync<CurrentUser>(`${API_CONFIG.identityUrl}/v1/users/me`),
};
