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
  email: string;
  name: string;
  dealer_id: string;
  dealer_name: string;
  locations: TokenLocation[];
}
