const LOCATION_KEY = "acme.locationId";
/** In localStorage (not sessionStorage): a sign-out that could not reach the service must still be known to the next tab. */
const REVOKE_PENDING_KEY = "acme.revokePending";
const CHANNEL_NAME = "acme.session";

/** What tabs of the app tell each other about the sign-in. A tab never receives its own messages. */
type SessionMessage = { kind: "signed-in" } | { kind: "signed-out" };

/** A sign-in or sign-out in another tab, for this tab to follow. */
export type OtherTabChange = SessionMessage;

/** Null outside a browser: React Router renders the app shell once at build time, where there is no window. */
function tabStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

let channel: BroadcastChannel | null = null;

/** The channel every tab of the app shares, for telling the others that someone signed in or out. */
function sessionChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** The access token: in memory only, never in storage. A reload gets a new one with the refresh cookie. */
let accessToken: string | null = null;

/**
 * Where the signed-in session lives in this tab: the access token (in memory, for minutes) and the location the user
 * selected (in sessionStorage, so each tab has its own: Maria can work at Northside in one tab and Riverside in another).
 *
 * Nothing that can sign anyone in is in storage a script can read. The refresh token, which lasts hours, is an httpOnly
 * cookie identity-api sets: the page never sees it, and the browser sends it only to the token endpoints. A new tab, or a
 * reload, has no access token yet and asks identity-api for one with that cookie; signing out in one tab ends the sign-in
 * for all and tells the other tabs over a BroadcastChannel.
 */
export const session = {
  getToken: (): string | null => accessToken,
  setToken: (token: string): void => {
    accessToken = token;
  },
  getLocationId: (): string | null => tabStorage()?.getItem(LOCATION_KEY) ?? null,
  setLocationId: (locationId: string): void => tabStorage()?.setItem(LOCATION_KEY, locationId),
  /** Forgets this tab's token and location. Other tabs are told separately (`announce`). */
  clear: (): void => {
    accessToken = null;
    tabStorage()?.removeItem(LOCATION_KEY);
  },

  /**
   * Signing out clears this tab, but ending the sign-in is a request to identity-api, which can fail (it is down, or slow).
   * The refresh cookie is then still good, and the next person to open the app would be signed in as the last one. So a
   * sign-out that did not get through is remembered here, and the next load ends the sign-in first and signs no one in.
   */
  isRevokePending: (): boolean => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(REVOKE_PENDING_KEY) !== null;
    } catch {
      return false;
    }
  },
  setRevokePending: (pending: boolean): void => {
    try {
      if (typeof window === "undefined") {
        return;
      }
      if (pending) {
        window.localStorage.setItem(REVOKE_PENDING_KEY, "1");
      } else {
        window.localStorage.removeItem(REVOKE_PENDING_KEY);
      }
    } catch {
      // Nothing to remember it in.
    }
  },

  /** Tells the other tabs this tab signed in or out, so they follow. */
  announce: (change: OtherTabChange): void => sessionChannel()?.postMessage(change),

  /** Calls `listener` when another tab signs in or out. Returns the function that stops listening. */
  onOtherTabChange: (listener: (change: OtherTabChange) => void): (() => void) => {
    const shared = sessionChannel();
    if (shared === null) {
      return () => undefined;
    }
    const onMessage = (event: MessageEvent<SessionMessage>): void => {
      listener(event.data);
    };
    shared.addEventListener("message", onMessage);
    return () => shared.removeEventListener("message", onMessage);
  },
};
