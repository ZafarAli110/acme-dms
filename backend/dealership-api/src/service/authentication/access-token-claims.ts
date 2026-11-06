/** A location the user works at, as issued by identity-api. */
export interface TokenLocation {
  id: string;
  code: string;
  name: string;
  role: string;
  permissions: string[];
}

/** The validated claims of an identity-api access token. */
export interface AccessTokenClaims {
  sub: string;
  /** The sign-in this token belongs to. Tokens issued before sign-ins had an id have none. */
  sid?: string;
  /** When the token ends, in seconds since 1970. */
  exp?: number;
  email: string;
  name: string;
  dealer_id: string;
  dealer_name: string;
  locations: TokenLocation[];
}
