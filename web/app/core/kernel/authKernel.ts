import {i18n} from '../../i18n';
import {type CurrentUser, identityQueries} from '../queries/identityQueries';
import {queryClient} from '../queries/queryClient';
import {session} from '../storage/sessionStore';

export type AuthStatus = 'resolving' | 'signed-in' | 'signed-out';

export interface AuthSnapshot {
  status: AuthStatus;
  user: CurrentUser | null;
}

const SIGNED_OUT: AuthSnapshot = {status: 'signed-out', user: null};
const RESOLVING: AuthSnapshot = {status: 'resolving', user: null};

/**
 * The single source of truth for who is signed in, outside React. The router middleware waits on it before any
 * protected loader runs; React reads it through `useAuth()` (useSyncExternalStore). Same role as IDS's authKernel,
 * without Logto: the token comes from identity-api and lives in session storage.
 */
export class AuthKernel {
  private _snapshot: AuthSnapshot = session.getToken() === null ? SIGNED_OUT : RESOLVING;
  private _resolving: Promise<void> | null = null;
  private readonly _listeners = new Set<() => void>();

  public getSnapshot(): AuthSnapshot {
    return this._snapshot;
  }

  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Resolves once a stored token has been checked against identity-api (at most once per sign-in). */
  public async waitForResolvedAuthAsync(): Promise<AuthSnapshot> {
    if (this._snapshot.status === 'resolving') {
      this._resolving ??= this.resolveUserAsync();
      await this._resolving;
    }
    return this._snapshot;
  }

  /** Throws the identity-api problem (for example 401) when the email or password is wrong. */
  public async signInAsync(email: string, password: string): Promise<void> {
    const {accessToken} = await identityQueries.signInAsync(email, password);
    // Start from a clean session: a location left by an earlier user must never be sent with the new token.
    session.clear();
    queryClient.clear();
    session.setToken(accessToken);
    this.commit(RESOLVING);
    this._resolving = this.resolveUserAsync();
    await this._resolving;
    if (this._snapshot.status !== 'signed-in') {
      throw new Error(i18n.t('errors.accountNotLoaded'));
    }
  }

  public signOut(): void {
    session.clear();
    queryClient.clear();
    this._resolving = null;
    this.commit(SIGNED_OUT);
  }

  private async resolveUserAsync(): Promise<void> {
    try {
      const user = await identityQueries.getCurrentUserAsync();
      this.commit({status: 'signed-in', user});
    } catch {
      // An expired or unknown token: back to the sign-in page.
      session.clear();
      this.commit(SIGNED_OUT);
    } finally {
      this._resolving = null;
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
