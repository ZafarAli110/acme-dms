const LOCATION_KEY = "acme.locationId";
/** In localStorage (not sessionStorage): a sign-out that could not reach the service must still be known to the next tab. */
const REVOKE_PENDING_KEY = "acme.revokePending";
const CHANNEL_NAME = "acme.session";

/** What tabs of the app tell each other about the sign-in. A tab never receives its own messages. */
/** What one tab tells the others: a sign-in names who signed in, so a tab already signed in as them changes nothing. */
type SessionMessage = { kind: "signed-in"; userId: string } | { kind: "signed-out" };

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

/** Whether this tab has a signed-in person: a 401 then means the sign-in ended, not that nobody signed in yet. */
let signedIn = false;

/**
 * What this tab knows of the sign-in: whether there is one, and the location the user selected (in sessionStorage, so each
 * tab has its own: Maria can work at Northside in one tab and Riverside in another).
 *
 * The page holds no token at all. The gateway keeps the sign-in (the backend for the frontend): the browser has only its
 * session cookie, httpOnly, which the page never sees and the browser sends with every `/api` request. A new tab or a reload
 * is signed in by that cookie; signing out in one tab ends the sign-in for all and tells the other tabs over a
 * BroadcastChannel.
 */
export const session = {
  isSignedIn: (): boolean => signedIn,
  setSignedIn: (value: boolean): void => {
    signedIn = value;
  },
  getLocationId: (): string | null => tabStorage()?.getItem(LOCATION_KEY) ?? null,
  setLocationId: (locationId: string): void => tabStorage()?.setItem(LOCATION_KEY, locationId),
  /** Forgets this tab's sign-in and location. Other tabs are told separately (`announce`). */
  clear: (): void => {
    signedIn = false;
    tabStorage()?.removeItem(LOCATION_KEY);
  },

  /**
   * Signing out clears this tab, but ending the sign-in is a request to the gateway, which can fail (it is down, or slow).
   * The session cookie is then still good, and the next person to open the app would be signed in as the last one. So a
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
