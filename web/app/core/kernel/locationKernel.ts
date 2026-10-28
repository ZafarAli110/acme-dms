import type {UserLocation} from '../queries/identityQueries';
import {queryClient} from '../queries/queryClient';
import {session} from '../storage/sessionStore';
import {type AuthKernel, type AuthSnapshot, authKernel} from './authKernel';

export type LocationStatus = 'pending' | 'ready' | 'signed-out';

export interface LocationSnapshot {
  status: LocationStatus;
  /** The locations the signed-in user works at. */
  locations: UserLocation[];
  /** The selected location; `ready` means there is one. */
  current: UserLocation | null;
}

const PENDING: LocationSnapshot = {status: 'pending', locations: [], current: null};
const SIGNED_OUT: LocationSnapshot = {status: 'signed-out', locations: [], current: null};

/**
 * The single source of truth for the selected location, outside React. It follows the auth kernel, keeps the
 * selection in session storage (the API client sends it as `x-location-id`), and is what the router middleware and
 * the location switcher use. React reads it through `useSelectedLocation()`. Same role as IDS's locationKernel,
 * without per-location tokens: Acme has one token and a header.
 */
export class LocationKernel {
  private _snapshot: LocationSnapshot;
  private readonly _authKernel: AuthKernel;
  private readonly _listeners = new Set<() => void>();

  public constructor(kernel: AuthKernel) {
    this._authKernel = kernel;
    this._snapshot = this.select(kernel.getSnapshot(), session.getLocationId());
    kernel.subscribe(() => this.commit(this.select(kernel.getSnapshot(), session.getLocationId())));
  }

  public getSnapshot(): LocationSnapshot {
    return this._snapshot;
  }

  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  public async waitForResolvedLocationAsync(): Promise<LocationSnapshot> {
    await this._authKernel.waitForResolvedAuthAsync();
    return this._snapshot;
  }

  /**
   * Switches the selected location. Pages with unsaved changes ask first: the switcher calls the location-change
   * guard (`useLocationChangeGuard().requestSwitch`) before this.
   */
  public switchLocation(locationId: string): void {
    if (!this._snapshot.locations.some((location) => location.id === locationId)) {
      throw new Error(`You do not work at location ${locationId}.`);
    }
    this.commit(this.select(this._authKernel.getSnapshot(), locationId));
    // Location-scoped data must never be shown for the wrong location. Query keys carry the location id, so this
    // only refreshes what is on screen.
    void queryClient.invalidateQueries();
  }

  private select(auth: AuthSnapshot, wantedId: string | null): LocationSnapshot {
    if (auth.status === 'resolving') {
      return PENDING;
    }
    if (auth.status === 'signed-out' || auth.user === null) {
      return SIGNED_OUT;
    }
    const locations = auth.user.locations;
    const current = locations.find((location) => location.id === wantedId) ?? locations[0] ?? null;
    if (current === null) {
      return {status: 'signed-out', locations, current: null};
    }
    if (current.id !== session.getLocationId()) {
      session.setLocationId(current.id);
    }
    return {status: 'ready', locations, current};
  }

  private commit(snapshot: LocationSnapshot): void {
    this._snapshot = snapshot;
    for (const listener of this._listeners) {
      listener();
    }
  }
}

export const locationKernel = new LocationKernel(authKernel);
