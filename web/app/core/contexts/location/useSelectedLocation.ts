import {useSyncExternalStore} from 'react';
import {type LocationSnapshot, locationKernel} from '../../kernel/locationKernel';

// Module-level, so useSyncExternalStore gets the same functions on every render and subscribes once.
function subscribe(listener: () => void): () => void {
  return locationKernel.subscribe(listener);
}

function getSnapshot(): LocationSnapshot {
  return locationKernel.getSnapshot();
}

/**
 * The selected location and the user's permissions there, from the location kernel. (Named so it is never confused
 * with React Router's `useLocation`, which is the URL.)
 */
export function useSelectedLocation() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const location = snapshot.current;
  return {
    location,
    locations: snapshot.locations,
    switchLocation: (locationId: string) => locationKernel.switchLocation(locationId),
    /** Whether the user holds the permission at the selected location. Check permissions, never role names. */
    can: (permission: string): boolean => location?.permissions.includes(permission) ?? false,
  };
}
