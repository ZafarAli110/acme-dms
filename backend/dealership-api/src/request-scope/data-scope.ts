import { AsyncLocalStorage } from "node:async_hooks";

/** Whose data a request may touch: what Postgres row-level security filters every query by. */
export interface DataScope {
  dealerId: string;
  /** The location selected for the request; null when none is (location-scoped tables then return nothing). */
  locationId: string | null;
  userId: string;
}

/**
 * The HTTP request a unit of work serves (ACME-121): whether it saves (anything but GET and HEAD), which decides the
 * connections it may use, and the signal that aborts when its caller goes away, which cancels its running statement.
 */
export interface RequestInfo {
  saves: boolean;
  signal: AbortSignal;
  /**
   * When the request's wait for connections ends (`performance.now()` time), set by its first unit of work: one wait for
   * the whole request, however many units of work it opens, so "busy" comes within one wait (ACME-121). Null at first.
   */
  connectBy: number | null;
  /**
   * The request has committed a change: from then on its units of work are never told "busy" (that would say "nothing
   * was changed" about a change already saved); they wait as background work does (the ACME-121 verifier's finding).
   */
  committed: boolean;
}

interface ScopeStore {
  scope: DataScope | null;
  request: RequestInfo | null;
}

const storage = new AsyncLocalStorage<ScopeStore>();

/**
 * Runs a request with an empty scope, which the authorization guard fills in once it knows who is asking. Code that
 * runs outside a request (the export worker, the message consumer, migrations, the seed) has no scope at all.
 */
export function runWithDataScope<T>(run: () => T, request: RequestInfo | null = null): T {
  return storage.run({ scope: null, request }, run);
}

/**
 * Runs `run` with the current request's scope (the same dealer, location and user) but not its lifetime: a read many
 * callers share, such as a cached value (`TtlCache`), must not be cancelled when the caller that happened to start it
 * goes away, or every caller waiting on it gets that cancellation (the state sweep's finding, ACME-129). It still reads
 * as a list does: the list connections, the list's wait, "busy" when that runs out.
 */
export function runDetachedFromCaller<T>(run: () => T): T {
  const store = storage.getStore();
  const request = store?.request;
  const detached: RequestInfo | null = request
    ? { saves: request.saves, signal: new AbortController().signal, connectBy: null, committed: false }
    : null;
  return storage.run({ scope: store?.scope ?? null, request: detached }, run);
}

/**
 * Runs `run` in the current request, scope and cancellation alike, with a connection wait of its own: for a request that
 * reads again and again for minutes (an export's progress stream), whose one wait its first read used up, so every
 * later read was told "busy" after 100 ms (the state sweep's F12).
 */
export function runWithOwnConnectionWait<T>(run: () => T): T {
  const store = storage.getStore();
  if (!store?.request) {
    return run();
  }
  return storage.run({ scope: store.scope, request: { ...store.request, connectBy: null } }, run);
}

/** The HTTP request being served, or null: outside a request, or a test that gives none. */
export function currentRequest(): RequestInfo | null {
  return storage.getStore()?.request ?? null;
}

/** Records who is asking, for the rest of the request. Outside `runWithDataScope` it does nothing. */
export function setDataScope(scope: DataScope): void {
  const store = storage.getStore();
  if (store) {
    store.scope = scope;
  }
}

/** True inside a request, whether or not the guard has set its scope yet; false for the worker, the consumer, the seed. */
export function isInRequest(): boolean {
  return storage.getStore() !== undefined;
}

/** The current request's scope, or null: no request, a public endpoint, or before the guard ran. */
export function currentDataScope(): DataScope | null {
  return storage.getStore()?.scope ?? null;
}
