/** The part of the HTTP response a controller needs to say where a new record lives. */
export type HeaderSetter = {setHeader(name: string, value: string): void};

/**
 * A 201 says where the new record can be read: `Location: /v1/customers/{id}`, relative to this service. The gateway
 * adds its own prefix (`/api/dealership`) on the way out, so callers get the URL they would use.
 */
export function setCreatedLocation(response: HeaderSetter, path: string): void {
  response.setHeader('location', path);
}
