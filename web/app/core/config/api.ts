/** Where each service is reached. The gateway routes /api/<service>/… onward; the dev server proxies /api to it. */
export const API_CONFIG = {
  identityUrl: '/api/identity',
  dealershipUrl: '/api/dealership',
  documentsUrl: '/api/documents',
  /** A request with no answer after this long fails with RequestTimeoutError. */
  timeoutMs: 15_000,
} as const;
