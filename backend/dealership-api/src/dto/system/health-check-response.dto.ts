/** Whether the service is up, which version is running ("26.11.0") and for how long. */
export interface HealthCheckResponseDto {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
}
