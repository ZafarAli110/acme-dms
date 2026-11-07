import { useEffect, useRef, useState } from "react";

export interface FormRevisionChange {
  /** The version of the record the form shows (its `updatedAt`). */
  shown: string;
  /** The newest version the page has read. */
  latest: string;
  /** Whether the form has changes not yet saved. */
  dirty: boolean;
  /** Whether this user's own save has just been answered. */
  savedHere: boolean;
}

/**
 * The version an edit form should show next: the newest when nothing would be lost (the form is clean, or the user's own
 * save just landed); otherwise the one it shows, so a change someone else saved never wipes the user's edits.
 */
export function nextShownRevision({ shown, latest, dirty, savedHere }: FormRevisionChange): string {
  return !dirty || savedHere ? latest : shown;
}

/**
 * For an edit page: which version of the record its form shows, as the form's key. A newer version (someone else's
 * save, read while the page polls or refetches) replaces the form only when that loses nothing; otherwise
 * `changedElsewhere` is true and the form offers `showLatest`, or (where saves carry a version) `keepMine`. `actionData` is the page's action result: a new one with
 * `saved` is the user's own save.
 */
export function useFormRevision(latest: string, actionData: { saved: boolean } | undefined) {
  const [shown, setShown] = useState(latest);
  const [dirty, setDirty] = useState(false);
  // A newer version the user chose to keep their edits over: the form took it in without starting again.
  const [kept, setKept] = useState<string | null>(null);
  const handled = useRef(actionData);
  useEffect(() => {
    const savedHere = actionData?.saved === true && actionData !== handled.current;
    handled.current = actionData;
    setShown((current) => nextShownRevision({ shown: current, latest, dirty, savedHere }));
  }, [latest, actionData, dirty]);
  return {
    formKey: shown,
    changedElsewhere: shown !== latest && kept !== latest,
    onDirtyChange: setDirty,
    showLatest: () => setShown(latest),
    keepMine: () => setKept(latest),
  };
}
