import { i18n } from "../../i18n";
import { ApiError } from "../config/apiErrors";
import { type CurrentUser, identityQueries } from "../queries/identityQueries";
import { queryClient } from "../queries/queryClient";
import { sessionExpiry } from "../services/sessionExpiry";
import { type OtherTabChange, session } from "../storage/sessionStore";

export type AuthStatus = "resolving" | "signed-in" | "signed-out";

export interface AuthSnapshot {
  status: AuthStatus;
  user: CurrentUser | null;
}

const SIGNED_OUT: AuthSnapshot = { status: "signed-out", user: null };
const RESOLVING: AuthSnapshot = { status: "resolving", user: null };

/**
 * The single source of truth for who is signed in, outside React. The router middleware waits on it before any
 * protected loader runs; React reads it through `useAuth()` (useSyncExternalStore). Same role as IDS's authKernel,
 * without Logto: the sign-in is the gateway's session, which every open tab shares through its httpOnly cookie
 * (`sessionStore.ts`).
 */
export class AuthKernel {
  // A browser tab starts by finding its sign-in: the session cookie every tab shares, if there is one.
  private _snapshot: AuthSnapshot = typeof window === "undefined" ? SIGNED_OUT : RESOLVING;
  private _resolving: Promise<void> | null = null;
  /** Counts sign-ins and sign-outs, so a check started for an earlier one never commits over a later one. */
  private _generation = 0;
  private readonly _listeners = new Set<() => void>();

  public constructor() {
    session.onOtherTabChange((change) => this.followOtherTab(change));
    sessionExpiry.onExpired(() => this.expire());
  }

  public getSnapshot(): AuthSnapshot {
    return this._snapshot;
  }

  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Resolves once this tab's sign-in is known: the session cookie's person, asked of identity-api through the gateway (at
   * most once per sign-in). Throws when they cannot be reached, so the next try asks again.
   */
  public async waitForResolvedAuthAsync(): Promise<AuthSnapshot> {
    if (this._snapshot.status === "resolving") {
      this._resolving ??= this.resolveUserAsync();
      await this._resolving;
    }
    return this._snapshot;
  }

  /** Throws the identity-api problem (for example 401) when the email or password is wrong. */
  public async signInAsync(email: string, password: string): Promise<void> {
    await identityQueries.signInAsync(email, password);
    // Start from a clean session: a location left by an earlier user must never be sent with the new sign-in.
    session.clear();
    queryClient.clear();
    this._generation += 1;
    // The sign-in replaced the cookie: a sign-out that could not end the old one is moot.
    session.setRevokePending(false);
    this.commit(RESOLVING);
    this._resolving = this.resolveUserAsync();
    await this._resolving;
    if (this._snapshot.status !== "signed-in") {
      throw new Error(i18n.t("errors.accountNotLoaded"));
    }
    session.announce({ kind: "signed-in" });
  }

  /**
   * Signs out this tab and every other open tab of the app, and ends the sign-in at the gateway, which deletes the session:
   * its cookie signs no one in from then on, at once. The person is signed out here first and always. If the gateway cannot
   * be reached the cookie is still good, so the sign-out is remembered (`setRevokePending`) and the next load ends the
   * sign-in before anything can use the cookie.
   */
  public async signOutAsync(): Promise<void> {
    this.forget();
    this.commit(SIGNED_OUT);
    session.announce({ kind: "signed-out" });
    session.setRevokePending(!(await identityQueries.revokeAsync()));
  }

  /** A request of this signed-in tab got a 401 (`sessionExpiry`): the sign-in is over, here and in the other tabs. */
  private expire(): void {
    this.forget();
    this.commit(SIGNED_OUT);
    session.announce({ kind: "signed-out" });
    if (typeof window !== "undefined") {
      // A full navigation, not the router's: nothing of the old sign-in (a form's state, a query's data) may survive it.
      window.location.replace("/sign-in");
    }
  }

  /**
   * Another tab signed out, or signed in, perhaps as someone else: this tab follows, so it never shows one user's
   * screens with another user's sign-in. Its cached data and location belonged to the old sign-in.
   */
  private followOtherTab(change: OtherTabChange): void {
    this.forget();
    if (change.kind === "signed-out") {
      this.commit(SIGNED_OUT);
      return;
    }
    // The other tab signed in as someone: the session cookie is theirs now, shared by every tab, so this tab follows it.
    this.commit(RESOLVING);
    // Nobody awaits this one: when identity-api cannot be reached, the tab stays resolving and the next navigation
    // (waitForResolvedAuthAsync) tries again and shows the error.
    this._resolving = this.resolveUserAsync().catch(() => undefined);
  }

  private forget(): void {
    session.clear();
    queryClient.clear();
    this._generation += 1;
    this._resolving = null;
  }

  private async resolveUserAsync(): Promise<void> {
    const generation = this._generation;
    // Another tab may sign out or in while this check waits: then this check is stale and changes nothing.
    const isCurrent = (): boolean => generation === this._generation;
    try {
      // A sign-out that did not reach the service left its cookie good: end that sign-in first, and sign no one in with it.
      if (session.isRevokePending()) {
        const ended = await identityQueries.revokeAsync();
        if (!isCurrent()) {
          return;
        }
        session.setRevokePending(!ended);
        this.commit(SIGNED_OUT);
        return;
      }
      // A new tab or a reload is signed in by the session cookie, if there is one: the gateway answers 401 when there is not.
      const user = await identityQueries.getCurrentUserAsync();
      if (isCurrent()) {
        session.setSignedIn(true);
        this.commit({ status: "signed-in", user });
      }
    } catch (error) {
      if (!isCurrent()) {
        return;
      }
      if (!isSignedOut(error)) {
        // identity-api or the gateway is down or slow: the error page says so and the next navigation tries again.
        throw error;
      }
      // No sign-in, or one that ended: back to the sign-in page, in this tab only.
      session.clear();
      this.commit(SIGNED_OUT);
    } finally {
      if (isCurrent()) {
        this._resolving = null;
      }
    }
  }

  private commit(snapshot: AuthSnapshot): void {
    this._snapshot = snapshot;
    for (const listener of this._listeners) {
      listener();
    }
  }
}

export const authKernel = new AuthKernel();

/** No sign-in: no session cookie, one whose session ended, or a user who no longer exists. */
function isSignedOut(error: unknown): boolean {
  return error instanceof ApiError && (error.problem.status === 401 || error.problem.status === 403);
}
