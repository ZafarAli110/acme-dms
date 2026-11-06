/**
 * Tells the app its sign-in is over: the service refused the refresh token (signed out elsewhere, ended by the
 * lifetime, or the person no longer exists). The API client cannot import the auth kernel (the kernel uses the client),
 * so it says so here and the kernel listens.
 */
let listener: (() => void) | null = null;

export const sessionExpiry = {
  /** The auth kernel's reaction: forget the session and go to the sign-in page. */
  onExpired(handler: () => void): void {
    listener = handler;
  },

  /** The sign-in is over. */
  expire(): void {
    listener?.();
  },
};
