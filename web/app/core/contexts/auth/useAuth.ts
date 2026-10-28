import {useSyncExternalStore} from 'react';
import {type AuthSnapshot, authKernel} from '../../kernel/authKernel';

// Module-level, so useSyncExternalStore gets the same functions on every render and subscribes once.
function subscribe(listener: () => void): () => void {
  return authKernel.subscribe(listener);
}

function getSnapshot(): AuthSnapshot {
  return authKernel.getSnapshot();
}

/** The signed-in user, from the auth kernel. */
export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  // Signing in and out are route actions (pages/SignIn.tsx, pages/SignOut.tsx), not functions of this hook.
  return {user: snapshot.user};
}
