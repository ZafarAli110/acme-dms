/**
 * Who is calling, for which dealer, and at which location. Built by the service layer from the validated access token
 * and passed explicitly to every handler that reads or writes dealership data. Every dealer shares one database, so
 * every query filters by `dealerId` itself.
 */
export interface UserContext {
  userId: string;
  /** The dealer (dealer group) the user belongs to, from the token's `dealer_id`. Never from the request. */
  dealerId: string;
  /** The location selected in the `x-location-id` header, validated against the token; null when none was sent. */
  locationId: string | null;
  /** Permissions the user holds at `locationId`; empty when no location was selected. */
  permissions: readonly string[];
  /** The user's own access token, forwarded when this service calls another on the user's behalf. */
  accessToken: string;
}
