/**
 * Where a scrolled grid was, per history entry (React Router's `location.key`), for this tab: Back from a record to the
 * list puts the rows where they were. One JSON map in `sessionStorage`, so a reload keeps it and closing the tab forgets
 * it; any failure to read or write (storage full or blocked, a value that is not ours) just means no restore.
 */
const STORAGE_KEY = "acme.gridScroll";
/** How many entries are kept: the least recently written go first, so a long session cannot fill the storage. */
const MAX_ENTRIES = 50;

type Entries = Record<string, { top: number; at: number }>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function load(store: Storage): Entries {
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Entries) : {};
  } catch {
    return {};
  }
}

export const scrollMemory = {
  /** The top offset saved for this history entry, or null when there is none. */
  read(key: string): number | null {
    try {
      const store = storage();
      const saved = store ? load(store)[key]?.top : undefined;
      return typeof saved === "number" && Number.isFinite(saved) && saved > 0 ? saved : null;
    } catch {
      return null;
    }
  },

  write(key: string, top: number, now: number = Date.now()): void {
    const store = storage();
    if (!store) {
      return;
    }
    try {
      const entries = load(store);
      if (top > 0) {
        entries[key] = { top: Math.round(top), at: now };
      } else {
        delete entries[key];
      }
      const keys = Object.keys(entries);
      if (keys.length > MAX_ENTRIES) {
        keys
          .toSorted((first, second) => (entries[first]?.at ?? 0) - (entries[second]?.at ?? 0))
          .slice(0, keys.length - MAX_ENTRIES)
          .forEach((stale) => delete entries[stale]);
      }
      store.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Nothing to do: the position is not kept.
    }
  },
};
