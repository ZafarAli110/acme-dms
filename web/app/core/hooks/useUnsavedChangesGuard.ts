import { useCallback, useEffect } from "react";
import { useBlocker } from "react-router";
import { useLocationChangeGuard } from "../contexts/location/LocationChangeGuardContext";
import { session } from "../storage/sessionStore";

/** Navigation state that lets one navigation through the guard, e.g. after a confirmed location switch. */
export const BYPASS_UNSAVED_CHANGES_GUARD = { bypassUnsavedChangesGuard: true };

/**
 * While `isDirty`, asks before leaving the page: in-app navigation and the back button (React Router's `useBlocker`),
 * and closing or reloading the tab (`beforeunload`). Steps aside while a location switch is being confirmed, so only
 * one question is asked. Use it through `<FormGuards>`.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const { pendingLocationId } = useLocationChangeGuard();
  const isSwitchingLocation = pendingLocationId !== null;

  // Stable between renders: a new function on every render makes useBlocker re-register in a loop.
  const shouldBlock = useCallback(
    ({
      currentLocation,
      nextLocation,
    }: {
      currentLocation: { pathname: string };
      nextLocation: { pathname: string; state: unknown };
    }) => {
      const state = nextLocation.state as { bypassUnsavedChangesGuard?: boolean } | null;
      return (
        isDirty &&
        !isSwitchingLocation &&
        state?.bypassUnsavedChangesGuard !== true &&
        currentLocation.pathname !== nextLocation.pathname
      );
    },
    [isDirty, isSwitchingLocation],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      // A tab whose sign-in ended (signed out here or in another tab) could save nothing: it goes to the sign-in page.
      if (session.isSignedIn()) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return {
    showDialog: blocker.state === "blocked",
    confirm: () => blocker.proceed?.(),
    cancel: () => blocker.reset?.(),
  };
}
