import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import type { GridApi } from "@mui/x-data-grid";
import { scrollMemory } from "../storage/scrollMemory";

/** The grid scrolls inside itself, which React Router's `<ScrollRestoration />` (the window only) does not see. */
type GridApiRef = RefObject<GridApi | null>;

/** Scrolls until the grid is where it was asked to be: its rows are measured a frame or two after it mounts. */
function scrollWhenReady(apiRef: GridApiRef, top: number, onDone: () => void): () => void {
  let frame = 0;
  let attempts = 0;
  const attempt = (): void => {
    const api = apiRef.current;
    if (!api) {
      onDone();
      return;
    }
    api.scroll({ top });
    attempts += 1;
    if (Math.abs(api.getScrollPosition().top - top) > 1 && attempts < 30) {
      frame = requestAnimationFrame(attempt);
    } else {
      onDone();
    }
  };
  frame = requestAnimationFrame(attempt);
  return () => cancelAnimationFrame(frame);
}

/**
 * Remembers how far a grid is scrolled for each history entry, and puts it back when that entry is shown again (Back
 * from a customer to the list, a reload). A new entry (a click, a new page or filter) starts at the top, as before.
 * `hasRows` is false until the grid has something to scroll.
 */
export function useGridScrollRestore(apiRef: GridApiRef, hasRows: boolean): void {
  const { key } = useLocation();
  // Saving waits until the saved position is back, or there is none: the grid reports 0 while it mounts.
  const saving = useRef(false);

  useEffect(() => {
    saving.current = scrollMemory.read(key) === null;
  }, [key]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = api.subscribeEvent("scrollPositionChange", ({ top }) => {
      if (!saving.current) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => scrollMemory.write(key, top), 100);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [apiRef, key]);

  useEffect(() => {
    const saved = scrollMemory.read(key);
    if (saved === null || !hasRows) {
      return undefined;
    }
    return scrollWhenReady(apiRef, saved, () => {
      saving.current = true;
    });
  }, [apiRef, key, hasRows]);
}
