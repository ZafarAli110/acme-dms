import { useEffect, useRef, useState } from "react";

/** A save's answer as a page's action returns it: whether the save is done. */
export interface SaveAnswer {
  saved: boolean;
}

/**
 * The key for the next save (ACME-125): the same until a save is answered as saved, whatever was answered before (a
 * lost answer, a refusal, "busy") and however the form changed since, so a save sent again is never done twice; a new
 * one once a save is done, so the next change is a save of its own.
 */
export function nextSaveKey(current: string, answer: SaveAnswer | null, makeKey: () => string): string {
  return answer?.saved === true ? makeKey() : current;
}

/**
 * One Idempotency-Key per save the user means to make, for a form page: sent with every Save of it, kept while the save
 * is unanswered, new after one is saved. `answer` is the page's action result: each new one is a save answered.
 * The server does the save once per key, so pressing Save again after a lost answer can never add a second record.
 */
export function useSaveKey(answer: SaveAnswer | undefined): string {
  const [key, setKey] = useState<string>(() => crypto.randomUUID());
  const handled = useRef(answer);
  useEffect(() => {
    if (answer === handled.current) {
      return;
    }
    handled.current = answer;
    setKey((current) => nextSaveKey(current, answer ?? null, () => crypto.randomUUID()));
  }, [answer]);
  return key;
}

/**
 * The search parameter a create adds when it opens the record its first save added (ACME-125): the record's page then
 * says the first save went through.
 */
export const FIRST_SAVE_WENT_THROUGH = "first-save-went-through";
