import { useEffect, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

/**
 * A save's error, shown until the user edits the form again: from then on it is about values no longer on screen. Keyed
 * by the action's result (`actionData`), not its text, so the same error from the next failed save shows again.
 */
export function useErrorUntilEdited<T extends FieldValues>(
  result: object | undefined,
  error: string | null | undefined,
  form: UseFormReturn<T>,
): string | null {
  const [editedPast, setEditedPast] = useState<object | undefined>(undefined);
  useEffect(() => {
    if (!result || !error) {
      return;
    }
    const subscription = form.watch(() => setEditedPast(result));
    return () => subscription.unsubscribe();
  }, [result, error, form]);
  return error && editedPast !== result ? error : null;
}
