import { i18n } from "../../i18n";
import { ApiError } from "../config/apiErrors";
import { type CurrentUser, identityQueries } from "../queries/identityQueries";
import { queryClient } from "../queries/queryClient";
import { sessionExpiry } from "../services/sessionExpiry";
import { type OtherTabChange, session } from "../storage/sessionStore";
import { exportKernel } from "./exportKernel";

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
  /** A sign-out the gateway did not get, being ended in the background while the sign-in page shows (resolveUserAsync). */
  private _endingPendingSignOut: Promise<void> | null = null;
  /** This tab's sign-out while it runs: pressing Sign out again joins it, so the gateway is asked once. */
  private _signingOut: Promise<void> | null = null;
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
    // A sign-out still ending in the background removes the cookie when its answer lands: it must land before this
    // sign-in's cookie, never after it.
    await this._endingPendingSignOut;
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
    if (this._snapshot.status !== "signed-in" || this._snapshot.user === null) {
      throw new Error(i18n.t("errors.accountNotLoaded"));
    }
    session.announce({ kind: "signed-in", userId: this._snapshot.user.id });
  }

  /**
   * Ends the sign-in at the gateway, which deletes the session: its cookie signs no one in from then on, at once. Then this
   * tab forgets its sign-in and tells the other tabs, which go to the sign-in page, and loads the sign-in page afresh.
   *
   * The page keeps showing what it showed until then: forgetting first would empty the screen behind the sign-out dialog
   * while the gateway answers. The gateway is given `signOutWaitMs`; a sign-out it did not get is remembered
   * (`setRevokePending`), before asking, so even a tab closed meanwhile has the next load end the sign-in first.
   *
   * Then it leaves for the sign-in page itself, answered or not, so a Back pressed while it waited cannot leave this tab
   * on a page whose sign-in has ended. A second call while it runs joins the first.
   */
  public signOutAsync(): Promise<void> {
    this._signingOut ??= this.endSignInAsync();
    return this._signingOut;
  }

  private async endSignInAsync(): Promise<void> {
    const generation = this._generation;
    session.setRevokePending(true);
    const ended = await identityQueries.revokeAsync();
    // Another tab signed in while this waited: the cookie is that sign-in's now, and must not be ended on the next load.
    session.setRevokePending(generation === this._generation && !ended);
    session.announce({ kind: "signed-out" });
    this.leaveForSignIn();
  }

  /** A request of this signed-in tab got a 401 (`sessionExpiry`): the sign-in is over, here and in the other tabs. */
  private expire(): void {
    session.announce({ kind: "signed-out" });
    this.leaveForSignIn();
  }

  /**
   * Another tab signed out, or signed in, perhaps as someone else: this tab follows, so it never shows one user's
   * screens with another user's sign-in. Its cached data and location belonged to the old sign-in.
   */
  private followOtherTab(change: OtherTabChange): void {
    if (change.kind === "signed-out") {
      // A tab already on the sign-in page has nothing to leave; any other tab's screens belonged to the sign-in that ended.
      if (this._snapshot.status === "signed-out") {
        this.forget();
        return;
      }
      this.leaveForSignIn();
      return;
    }
    // The same person signing in again elsewhere: the cookie is still theirs, so this tab keeps its location, its data
    // and any unsaved form.
    if (this._snapshot.status === "signed-in" && this._snapshot.user?.id === change.userId) {
      return;
    }
    // Someone else, or a tab that was not signed in: the cookie is the new sign-in's now. A fresh load of the home page
    // finds who it is (and shows an error page, with a retry, if identity-api cannot be reached), with nothing of the
    // old sign-in left on screen.
    this.forget();
    if (typeof window !== "undefined") {
      window.location.replace("/");
    }
  }

  /**
   * The sign-in ended: this tab forgets it and loads the sign-in page with a full navigation, not the router's, so nothing
   * of the old sign-in (a form's state, a query's data) survives. Nothing is shown in between: telling React first would
   * redraw the old screen without its location (empty skeletons, "not a customer of") until the new page loads.
   */
  private leaveForSignIn(): void {
    // Also what lets a form with unsaved changes go without asking (useUnsavedChangesGuard): nothing could save them now.
    session.clear();
    this._generation += 1;
    this._resolving = null;
    if (typeof window !== "undefined") {
      window.location.replace("/sign-in");
    }
  }

  private forget(): void {
    session.clear();
    queryClient.clear();
    // The cards hold the previous sign-in's download links; the next user's exports are put back from the service.
    exportKernel.reset();
    this._generation += 1;
    this._resolving = null;
  }

  private async resolveUserAsync(): Promise<void> {
    const generation = this._generation;
    // Another tab may sign out or in while this check waits: then this check is stale and changes nothing.
    const isCurrent = (): boolean => generation === this._generation;
    try {
      // A sign-out that did not reach the service left its cookie good: sign no one in with it. The sign-in page shows at
      // once, and the sign-out is ended in the background: the gateway may be slow or down, and nobody should wait for it.
      if (session.isRevokePending()) {
        this.signedOut();
        this._endingPendingSignOut ??= this.endPendingSignOutAsync();
        return;
      }
      // A new tab or a reload is signed in by the session cookie, if there is one. The gateway says which with a 200 either
      // way, so a signed-out visit asks no service "who am I" and logs no 401.
      const { isSignedIn } = await identityQueries.getSessionAsync();
      if (!isCurrent()) {
        return;
      }
      if (!isSignedIn) {
        this.signedOut();
        return;
      }
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
      this.signedOut();
    } finally {
      if (isCurrent()) {
        this._resolving = null;
      }
    }
  }

  /** Nobody is signed in in this tab: and whatever the browser cached is dropped, without waiting for it. */
  private signedOut(): void {
    session.clear();
    this.commit(SIGNED_OUT);
    identityQueries.forgetCache();
  }

  /** Ends a sign-out the gateway did not get. Still unreached, it stays remembered for the next load. */
  private async endPendingSignOutAsync(): Promise<void> {
    try {
      const ended = await identityQueries.revokeAsync();
      // A sign-in since then waited for this, and clears the flag itself after.
      session.setRevokePending(!ended);
    } finally {
      this._endingPendingSignOut = null;
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
