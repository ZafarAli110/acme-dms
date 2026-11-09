import type { IClock } from "#business-logic-abstractions/time/clock.interface";

interface Entry<Value> {
  /** The value, or the read that will give it, shared by every caller that asks while it runs. */
  value: Promise<Value>;
  /** Epoch milliseconds after which the next caller reads again. */
  expiresAt: number;
}

/**
 * Values kept in this process for a short while (ACME-129, the first cache in the service): each key's value is read
 * at most once per `ttlMs`, however many ask, and callers asking while it is being read wait for that one read. A read
 * that fails is not kept, so the next caller tries again. Each API instance keeps its own: four instances read a key
 * at most four times per `ttlMs`.
 *
 * The key is the caller's to make, and it must hold everything the value depends on: for dealership data the dealer,
 * and for a location's data the location too (docs/standards/multi-tenancy.md, "Location", rule 3). Not the user: a
 * value every user at the location sees the same way is one entry; who may see it is checked before the cache.
 *
 * Concurrency: Node runs this process's JavaScript on one thread, and nothing awaits between finding no entry and
 * storing the new read, so two callers cannot both start one. The read is shared, so it must not belong to the caller
 * that started it: run it with `runDetachedFromCaller`, or that caller leaving cancels every waiter's answer.
 *
 * Where it stops fitting (docs/ARCHITECTURE.md, "Cache a total only where it may be old"): each instance keeps its
 * own entries and nothing clears them early, so use it only for a value that may be `ttlMs` old. With many instances
 * (each reads a key once per `ttlMs`), or for a value that must change everywhere the moment it changes, move to a
 * shared cache (Redis), cleared by the outbox's events, as the 200,000-a-second design does.
 */
export class TtlCache<Value> {
  private readonly _entries = new Map<string, Entry<Value>>();
  private readonly _clock: IClock;
  private readonly _ttlMs: number;
  private readonly _maxEntries: number;

  public constructor(clock: IClock, ttlMs: number, maxEntries = 10_000) {
    this._clock = clock;
    this._ttlMs = ttlMs;
    this._maxEntries = maxEntries;
  }

  public getAsync(key: string, readAsync: () => Promise<Value>): Promise<Value> {
    const now = this._clock.now().epochMilliseconds;
    const kept = this._entries.get(key);
    if (kept && kept.expiresAt > now) {
      return kept.value;
    }
    const value = readAsync();
    this._entries.delete(key);
    if (this._entries.size >= this._maxEntries) {
      // The oldest key goes first: a Map keeps the order keys were added in.
      const oldest = this._entries.keys().next();
      if (!oldest.done) {
        this._entries.delete(oldest.value);
      }
    }
    const entry: Entry<Value> = { value, expiresAt: now + this._ttlMs };
    this._entries.set(key, entry);
    value.catch(() => {
      if (this._entries.get(key) === entry) {
        this._entries.delete(key);
      }
    });
    return value;
  }
}
