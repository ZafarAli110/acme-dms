import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { requireSetting, SETTINGS, type Settings } from "#settings/settings";

/** How often identity-api is asked. A sign-out reaches this service within this, and the question's own time. */
export const ASK_EVERY_MS = 5_000;
/** An access token lives 15 minutes; one more for clock drift. Must match identity-api's `TokenSettings`. */
export const REMEMBER_FOR_MS = 16 * 60_000;
/** A little back from the last answer's clock, so a sign-in ended at the very moment of the last answer is not missed. */
const OVERLAP_MS = 2_000;
/** A question that takes longer than this is given up on (and asked again at the next tick). */
const ASK_TIMEOUT_MS = 2_000;

/**
 * Keeps the sign-ins identity-api has ended lately, and refuses their access tokens. Every few seconds it asks identity-api
 * (`GET /v1/sessions/revoked?since=`) and remembers what comes back for as long as an access token can live. A request then
 * only looks the sign-in up in memory: nothing waits for identity-api, a slow or absent identity-api cannot make a request
 * slow or refuse it (new sign-ins can only end at identity-api, so while it is down there is nothing new to learn), and the
 * cost is one small question per instance, not per person.
 *
 * Every question starts at the last answer's clock, or at the oldest a live token could be, whichever is later: after a long
 * outage the first answer is complete for any token that can still be shown. The service asks once before it takes requests.
 */
@Injectable()
export class RevokedSessionsFeed implements OnModuleInit, OnModuleDestroy {
  private readonly _logger = new Logger(RevokedSessionsFeed.name);
  private readonly _identityApiUrl: string;
  /** The ended sign-ins, each with the moment it can be forgotten. */
  private readonly _ended = new Map<string, number>();
  private _lastAnswerNow: number | null = null;
  private _timer: ReturnType<typeof setInterval> | null = null;

  public constructor(@Inject(SETTINGS) settings: Settings) {
    this._identityApiUrl = requireSetting(settings.identityApiUrl, "services__identity-api__http__0");
  }

  public async onModuleInit(): Promise<void> {
    await this.refreshAsync();
    this._timer = setInterval(() => void this.refreshAsync(), ASK_EVERY_MS);
    // Not what keeps the process alive.
    this._timer.unref();
  }

  public onModuleDestroy(): void {
    if (this._timer) {
      clearInterval(this._timer);
    }
  }

  public isEnded(sessionId: string): boolean {
    return this._ended.has(sessionId);
  }

  /** One question and what follows from the answer; a failure keeps what is known. */
  public async refreshAsync(now: number = Date.now()): Promise<void> {
    const since = this._lastAnswerNow === null ? now - REMEMBER_FOR_MS : this._lastAnswerNow - OVERLAP_MS;
    try {
      const response = await fetch(
        `${this._identityApiUrl}/v1/sessions/revoked?since=${encodeURIComponent(new Date(since).toISOString())}`,
        { signal: AbortSignal.timeout(ASK_TIMEOUT_MS) },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`identity-api answered ${response.status}`);
      }
      const answer = (await response.json()) as { now: string; revoked: string[] };
      for (const sessionId of answer.revoked) {
        this._ended.set(sessionId, now + REMEMBER_FOR_MS);
      }
      this._lastAnswerNow = Date.parse(answer.now);
      for (const [sessionId, forgetAt] of this._ended) {
        if (forgetAt <= now) {
          this._ended.delete(sessionId);
        }
      }
    } catch (error) {
      this._logger.warn(
        `identity-api could not be asked which sign-ins ended; what is known is kept: ${String(error)}`,
      );
    }
  }
}
