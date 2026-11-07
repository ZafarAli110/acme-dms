/** Where each service is reached. The gateway routes /api/<service>/… onward; the dev server proxies /api to it. */
export const API_CONFIG = {
  identityUrl: "/api/identity",
  dealershipUrl: "/api/dealership",
  documentsUrl: "/api/documents",
  /** Signing in (POST) and out (DELETE): the gateway keeps the sign-in, and the browser only its cookie. */
  sessionUrl: "/api/session",
  /** Asks the browser to drop what it cached (DELETE), on a request of its own: the browser may take seconds to clear. */
  sessionCacheUrl: "/api/session/cache",
  /** A request with no answer after this long fails with RequestTimeoutError. */
  timeoutMs: 15_000,
  /** Signing out waits this long for each service call it makes: it must never hang because a service is down. */
  signOutWaitMs: 5000,
} as const;
