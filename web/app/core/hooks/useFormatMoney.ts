import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../formatters/formatMoney";

/** Formats whole cents as dollars in the user's current language: `formatMoney(4999)` → "$49.99" or "49,99 $". */
export function useFormatMoney(): (cents: number) => string {
  const { i18n } = useTranslation();
  return useCallback((cents: number) => formatMoney(cents, i18n.language), [i18n.language]);
}
