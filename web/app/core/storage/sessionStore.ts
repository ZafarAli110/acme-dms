const TOKEN_KEY = 'acme.accessToken';
const LOCATION_KEY = 'acme.locationId';

/** Null outside a browser: React Router renders the app shell once at build time, where there is no sessionStorage. */
function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

/**
 * Where the signed-in session lives: the token and the location the user selected. Both are kept in sessionStorage
 * (cleared when the tab closes) and cleared together, because a location only makes sense for the user who chose it.
 * Development demo: a production app would keep the token in an httpOnly cookie set by the identity service.
 */
export const session = {
  getToken: (): string | null => storage()?.getItem(TOKEN_KEY) ?? null,
  setToken: (token: string): void => storage()?.setItem(TOKEN_KEY, token),
  getLocationId: (): string | null => storage()?.getItem(LOCATION_KEY) ?? null,
  setLocationId: (locationId: string): void => storage()?.setItem(LOCATION_KEY, locationId),
  clear: (): void => {
    storage()?.removeItem(TOKEN_KEY);
    storage()?.removeItem(LOCATION_KEY);
  },
};
