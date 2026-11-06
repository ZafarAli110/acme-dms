import { API_CONFIG } from "../config/api";
import { apiClient } from "../services/apiClient";

/** How long sign-out waits for the service: it must never hang because a service is down. */
const SIGN_OUT_WAIT_MS = 2000;

/** Calls that are about the service, not a record. */
export const systemQueries = {
  /**
   * Asks the browser to drop what it kept of this site's answers (the service answers `Clear-Site-Data: "cache"`).
   * Best effort: a failure changes nothing for the user, who is signed out either way. Browsers that do not
   * support the header (Safari) keep nothing worse than before: every kept answer is revalidated with the service,
   * which needs a token.
   */
  clearBrowserCacheAsync: (): Promise<void> =>
    apiClient
      .postAsync<void>(`${API_CONFIG.dealershipUrl}/v1/system/sign-out`, undefined, {
        signal: AbortSignal.timeout(SIGN_OUT_WAIT_MS),
      })
      .catch(() => undefined),
};
