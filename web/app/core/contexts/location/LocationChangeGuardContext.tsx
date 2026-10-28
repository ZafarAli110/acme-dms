import {createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState} from 'react';

interface LocationChangeGuardValue {
  /** Registers a guard; returns the function that removes it. While one is registered, switches are held. */
  registerGuard: () => () => void;
  /** Called by the location switcher. True: switch now. False: a form has unsaved changes; the switch is held. */
  requestSwitch: (locationId: string) => boolean;
  /** The held switch, waiting for the user to confirm or cancel. */
  pendingLocationId: string | null;
  /** Returns the held location id and clears it. */
  confirmSwitch: () => string | null;
  cancelSwitch: () => void;
  /** Lets a form's `beforeunload` handler be turned off before a confirmed hard navigation. */
  registerBeforeUnloadBypass: (bypass: () => void) => void;
  disableAllBeforeUnload: () => void;
}

const LocationChangeGuardContext = createContext<LocationChangeGuardValue | null>(null);

/**
 * Lets a form with unsaved changes hold a location switch until the user confirms. Switching location under a form
 * would save its data at the wrong location (bins, customers and stock belong to one location).
 */
export function LocationChangeGuardProvider({children}: {children: ReactNode}) {
  const guardCount = useRef(0);
  const bypasses = useRef(new Set<() => void>());
  const [pendingLocationId, setPendingLocationId] = useState<string | null>(null);

  const registerGuard = useCallback(() => {
    guardCount.current++;
    return () => {
      guardCount.current--;
      if (guardCount.current === 0) {
        setPendingLocationId(null);
      }
    };
  }, []);

  const requestSwitch = useCallback((locationId: string) => {
    if (guardCount.current > 0) {
      setPendingLocationId(locationId);
      return false;
    }
    return true;
  }, []);

  const confirmSwitch = useCallback(() => {
    const locationId = pendingLocationId;
    setPendingLocationId(null);
    return locationId;
  }, [pendingLocationId]);

  const cancelSwitch = useCallback(() => setPendingLocationId(null), []);

  const registerBeforeUnloadBypass = useCallback((bypass: () => void) => {
    bypasses.current.add(bypass);
  }, []);

  const disableAllBeforeUnload = useCallback(() => {
    for (const bypass of bypasses.current) {
      bypass();
    }
  }, []);

  const value = useMemo<LocationChangeGuardValue>(
    () => ({
      registerGuard,
      requestSwitch,
      pendingLocationId,
      confirmSwitch,
      cancelSwitch,
      registerBeforeUnloadBypass,
      disableAllBeforeUnload,
    }),
    [
      registerGuard,
      requestSwitch,
      pendingLocationId,
      confirmSwitch,
      cancelSwitch,
      registerBeforeUnloadBypass,
      disableAllBeforeUnload,
    ],
  );

  return <LocationChangeGuardContext.Provider value={value}>{children}</LocationChangeGuardContext.Provider>;
}

export function useLocationChangeGuard(): LocationChangeGuardValue {
  const value = useContext(LocationChangeGuardContext);
  if (!value) {
    throw new Error('useLocationChangeGuard must be used inside <LocationChangeGuardProvider>');
  }
  return value;
}
