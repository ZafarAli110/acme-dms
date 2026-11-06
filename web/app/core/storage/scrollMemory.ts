/**
 * Where a scrolled grid was, per history entry (React Router's `location.key`), for this tab: Back from a record to the
 * list puts the rows where they were. In `sessionStorage`, so a reload keeps it and closing the tab forgets it; any
 * failure to read or write (storage full or blocked) just means no restore.
 */
const PREFIX = "gridScroll:";
/** How many entries are kept: the oldest go first, so a long session cannot fill the storage. */
const MAX_ENTRIES = 50;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export const scrollMemory = {
  /** The top offset saved for this history entry, or null when there is none. */
  read(key: string): number | null {
    try {
      const saved = Number(storage()?.getItem(PREFIX + key));
      return Number.isFinite(saved) && saved > 0 ? saved : null;
    } catch {
      return null;
    }
  },

  write(key: string, top: number): void {
    const store = storage();
    if (!store) {
      return;
    }
    try {
      if (top > 0) {
        store.setItem(PREFIX + key, String(Math.round(top)));
        scrollMemory.trim(store);
      } else {
        store.removeItem(PREFIX + key);
      }
    } catch {
      // Nothing to do: the position is not kept.
    }
  },

  /** Drops the oldest entries beyond MAX_ENTRIES (storage keeps insertion order for keys it lists). */
  trim(store: Storage): void {
    const keys: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key?.startsWith(PREFIX)) {
        keys.push(key);
      }
    }
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
      store.removeItem(stale);
    }
  },
};
