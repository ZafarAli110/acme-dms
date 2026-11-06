import { AsyncLocalStorage } from "node:async_hooks";

/** Whose data a request may touch: what Postgres row-level security filters every query by. */
export interface DataScope {
  dealerId: string;
  /** The location selected for the request; null when none is (location-scoped tables then return nothing). */
  locationId: string | null;
  userId: string;
}

interface ScopeStore {
  scope: DataScope | null;
}

const storage = new AsyncLocalStorage<ScopeStore>();

/**
 * Runs a request with an empty scope, which the authorization guard fills in once it knows who is asking. Code that
 * runs outside a request (the export worker, the message consumer, migrations, the seed) has no scope at all.
 */
export function runWithDataScope<T>(run: () => T): T {
  return storage.run({ scope: null }, run);
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
