import { useSyncExternalStore } from "react";
import { type AuthSnapshot, authKernel } from "../../kernel/authKernel";

// Module-level, so useSyncExternalStore gets the same functions on every render and subscribes once.
function subscribe(listener: () => void): () => void {
  return authKernel.subscribe(listener);
}

function getSnapshot(): AuthSnapshot {
  return authKernel.getSnapshot();
}

/**
 * Ends the sign-in and leaves for the sign-in page. Not a route action: its code is loaded with the app, so signing out
 * works even when no more of the app can be loaded (offline).
 */
function signOutAsync(): Promise<void> {
  return authKernel.signOutAsync();
}

/** The signed-in user, from the auth kernel, and signing out. Signing in is a route action (pages/SignIn.tsx). */
export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  return { user: snapshot.user, signOutAsync };
}
