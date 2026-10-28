/**
 * Who is calling and on behalf of which dealer and location. Built by the service layer from the validated access
 * token and passed explicitly to every handler that reads or writes dealer data.
 */
export interface UserContext {
  userId: string;
  dealerId: string;
  /** The location selected in the `x-location-id` header, validated against the token; null when none was sent. */
  locationId: string | null;
  /** Permissions the user holds at `locationId`; empty when no location was selected. */
  permissions: readonly string[];
  /** The user's own access token, forwarded when this service calls another on the user's behalf. */
  accessToken: string;
}
