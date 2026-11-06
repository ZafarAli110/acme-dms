import { i18n } from "../../i18n";
import { ApiError } from "../config/apiErrors";
import { type CurrentUser, identityQueries } from "../queries/identityQueries";
import { queryClient } from "../queries/queryClient";
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
 * without Logto: the token comes from identity-api and lives in session storage, shared with the app's other open
 * tabs on request (`sessionStore.ts`).
 */
export class AuthKernel {
  // A browser tab starts by finding its sign-in: its own token, or one another open tab shares.
  private _snapshot: AuthSnapshot = typeof window === "undefined" ? SIGNED_OUT : RESOLVING;
  private _resolving: Promise<void> | null = null;
  /** Counts sign-ins and sign-outs, so a check started for an earlier one never commits over a later one. */
  private _generation = 0;
  private readonly _listeners = new Set<() => void>();

  public constructor() {
    session.onOtherTabChange((change) => this.followOtherTab(change));
  }

  public getSnapshot(): AuthSnapshot {
    return this._snapshot;
  }

  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Resolves once this tab's sign-in is known: its token, or one another open tab shares, checked against identity-api
   * (at most once per sign-in). Throws when identity-api cannot be reached, keeping the token for the next try.
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
    const { accessToken } = await identityQueries.signInAsync(email, password);
    // Start from a clean session: a location left by an earlier user must never be sent with the new token.
    session.clear();
    queryClient.clear();
    this._generation += 1;
    session.setToken(accessToken);
    this.commit(RESOLVING);
    this._resolving = this.resolveUserAsync();
    await this._resolving;
    if (this._snapshot.status !== "signed-in") {
      throw new Error(i18n.t("errors.accountNotLoaded"));
    }
    session.announce({ kind: "signed-in", token: accessToken });
  }

  /** Signs out this tab and every other open tab of the app. */
  public signOut(): void {
    this.forget();
    this.commit(SIGNED_OUT);
    session.announce({ kind: "signed-out" });
  }

  /**
   * Another tab signed out, or signed in, perhaps as someone else: this tab follows, so it never shows one user's
   * screens with another user's token. Its cached data and location belonged to the old sign-in.
   */
  private followOtherTab(change: OtherTabChange): void {
    this.forget();
    if (change.kind === "signed-out") {
      this.commit(SIGNED_OUT);
      return;
    }
    session.setToken(change.token);
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
      let token = session.getToken();
      if (token === null) {
        token = await session.askOtherTabsAsync();
        if (!isCurrent()) {
          return;
        }
        if (token !== null) {
          session.setToken(token);
        }
      }
      if (token === null) {
        this.commit(SIGNED_OUT);
        return;
      }
      const user = await identityQueries.getCurrentUserAsync();
      if (isCurrent()) {
        this.commit({ status: "signed-in", user });
      }
    } catch (error) {
      if (!isCurrent()) {
        return;
      }
      if (!isRejectedToken(error)) {
        // identity-api is down or slow: keep the token; the error page says so and the next navigation tries again.
        throw error;
      }
      // An expired or unknown token: back to the sign-in page, in this tab only.
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

/** identity-api refused the token itself (expired, unknown, or for a user who no longer exists). */
function isRejectedToken(error: unknown): boolean {
  return error instanceof ApiError && (error.problem.status === 401 || error.problem.status === 403);
}
