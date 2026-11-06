import { Inject, Injectable, Logger } from "@nestjs/common";
import { requireSetting, SETTINGS, type Settings } from "#settings/settings";
import type { AccessTokenClaims } from "./access-token-claims";

/** An open sign-in is asked about again after this long, so ending one reaches this service within it. */
export const OPEN_SIGN_IN_REMEMBERED_MS = 10_000;
/** A request does not wait longer than this for identity-api to say. */
const ASK_TIMEOUT_MS = 2000;
/** The most sign-ins remembered at once: a busy service forgets the oldest, which only costs one more question. */
const MAX_REMEMBERED = 10_000;

/**
 * Whether the sign-in an access token belongs to is still open. Signing out ends it at identity-api, and this is how
 * this service learns it: a token whose sign-in was ended is refused even though it has not expired. identity-api is
 * asked (`GET /v1/sessions/current`, with the token) and the answer is remembered briefly; an ended sign-in never opens
 * again, so it is remembered until its token would have expired.
 *
 * When identity-api cannot be reached the token, which was verified and lasts minutes, is accepted (and asked about again
 * after the same ten seconds): this service does not stop serving because the sign-in authority restarts, and the check
 * resumes with it.
 */
@Injectable()
export class SessionStatusChecker {
  private readonly _logger = new Logger(SessionStatusChecker.name);
  private readonly _identityApiUrl: string;
  private readonly _remembered = new Map<string, { open: boolean; until: number }>();

  public constructor(@Inject(SETTINGS) settings: Settings) {
    this._identityApiUrl = requireSetting(settings.identityApiUrl, "services__identity-api__http__0");
  }

  public async isOpenAsync(token: string, claims: AccessTokenClaims, now: number = Date.now()): Promise<boolean> {
    if (!claims.sid) {
      return true;
    }
    const known = this._remembered.get(claims.sid);
    if (known && known.until > now) {
      return known.open;
    }

    const open = await this.askAsync(token);
    const tokenEnds = (claims.exp ?? 0) * 1000;
    const until = open ? now + OPEN_SIGN_IN_REMEMBERED_MS : tokenEnds;
    if (until > now) {
      this.remember(claims.sid, { open, until }, now);
    }
    return open;
  }

  private async askAsync(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${this._identityApiUrl}/v1/sessions/current`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
      });
      return response.status !== 401;
    } catch (error) {
      this._logger.warn(
        `identity-api could not be asked whether a sign-in is open; the token is accepted: ${String(error)}`,
      );
      return true;
    }
  }

  private remember(sessionId: string, entry: { open: boolean; until: number }, now: number): void {
    if (this._remembered.size >= MAX_REMEMBERED) {
      for (const [key, value] of this._remembered) {
        if (value.until <= now) {
          this._remembered.delete(key);
        }
      }
      if (this._remembered.size >= MAX_REMEMBERED) {
        const oldest = this._remembered.keys().next();
        if (!oldest.done) {
          this._remembered.delete(oldest.value);
        }
      }
    }
    this._remembered.set(sessionId, entry);
  }
}
