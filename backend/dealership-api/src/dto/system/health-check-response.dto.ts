/**
 * The same shape from every service (the gateway, identity-api, document-api and dealership-api): which service, whether
 * it is fine ("degraded" when it cannot reach its database), the product version ("26.11.0"), and whether the database
 * answers (`null` for a service without one).
 */
export interface HealthCheckResponseDto {
  service: string;
  status: 'ok' | 'degraded';
  version: string;
  databaseReachable: boolean | null;
}
