const TOKEN_KEY = "acme.accessToken";
const LOCATION_KEY = "acme.locationId";
const CHANNEL_NAME = "acme.session";
/** How long a new tab waits for an open tab to share its sign-in. An open tab answers within milliseconds. */
const ASK_TIMEOUT_MS = 300;

/** What tabs of the app tell each other about the sign-in. A tab never receives its own messages. */
type SessionMessage =
  { kind: "ask" } | { kind: "answer"; token: string } | { kind: "signed-in"; token: string } | { kind: "signed-out" };

/** A sign-in or sign-out in another tab, for this tab to follow. */
export type OtherTabChange = { kind: "signed-in"; token: string } | { kind: "signed-out" };

/** Null outside a browser: React Router renders the app shell once at build time, where there is no window. */
function tabStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

let channel: BroadcastChannel | null = null;

/** The channel every tab of the app shares; it answers other tabs' asks with this tab's token, if it has one. */
function sessionChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (channel === null) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", answerAsk);
  }
  return channel;
}

function answerAsk(event: MessageEvent<SessionMessage>): void {
  const token = session.getToken();
  if (event.data.kind === "ask" && token !== null) {
    post({ kind: "answer", token });
  }
}

function post(message: SessionMessage): void {
  sessionChannel()?.postMessage(message);
}

/**
 * Where the signed-in session lives: the token and the location the user selected, both in sessionStorage, so each
 * tab has its own and closing the browser signs out. Tabs share the sign-in by asking each other over a
 * BroadcastChannel: a new tab is signed in while any tab of the app is open; signing out in one tab signs out all.
 * Maria can still work at Northside in one tab and Riverside in another: the location is never shared.
 *
 * Development demo: a production app would keep the token in an httpOnly cookie set by the identity service, out of
 * reach of the page's scripts.
 */
export const session = {
  getToken: (): string | null => tabStorage()?.getItem(TOKEN_KEY) ?? null,
  setToken: (token: string): void => tabStorage()?.setItem(TOKEN_KEY, token),
  getLocationId: (): string | null => tabStorage()?.getItem(LOCATION_KEY) ?? null,
  setLocationId: (locationId: string): void => tabStorage()?.setItem(LOCATION_KEY, locationId),
  /** Forgets this tab's token and location. Other tabs are told separately (`announce`). */
  clear: (): void => {
    tabStorage()?.removeItem(TOKEN_KEY);
    tabStorage()?.removeItem(LOCATION_KEY);
  },

  /** Asks the other open tabs for their token: the first answer, or null when no tab answers in time. */
  askOtherTabsAsync: (): Promise<string | null> => {
    const shared = sessionChannel();
    if (shared === null) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const onMessage = (event: MessageEvent<SessionMessage>): void => {
        if (event.data.kind === "answer") {
          finish(event.data.token);
        }
      };
      const timer = setTimeout(() => finish(null), ASK_TIMEOUT_MS);
      const finish = (token: string | null): void => {
        clearTimeout(timer);
        shared.removeEventListener("message", onMessage);
        resolve(token);
      };
      shared.addEventListener("message", onMessage);
      post({ kind: "ask" });
    });
  },

  /** Tells the other tabs this tab signed in or out, so they follow. */
  announce: (change: OtherTabChange): void => post(change),

  /** Calls `listener` when another tab signs in or out. Returns the function that stops listening. */
  onOtherTabChange: (listener: (change: OtherTabChange) => void): (() => void) => {
    const shared = sessionChannel();
    if (shared === null) {
      return () => undefined;
    }
    const onMessage = (event: MessageEvent<SessionMessage>): void => {
      if (event.data.kind === "signed-in" || event.data.kind === "signed-out") {
        listener(event.data);
      }
    };
    shared.addEventListener("message", onMessage);
    return () => shared.removeEventListener("message", onMessage);
  },
};
