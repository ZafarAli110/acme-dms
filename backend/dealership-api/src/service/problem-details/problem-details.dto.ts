/**
 * RFC 9457 problem details, extended with the fields Acme services use to trace a failure.
 * A contract: every field is always present, and is `null` when there is no value.
 */
export interface ProblemDetailsDto {
  type: string;
  title: string;
  status: number;
  detail: string | null;
  instance: string | null;
  /** The location (rooftop) the request was made for. */
  location: string | null;
  userId: string | null;
  /** OpenTelemetry trace id, so the failure can be found in the Aspire dashboard. */
  traceId: string | null;
  timestamp: string;
}
