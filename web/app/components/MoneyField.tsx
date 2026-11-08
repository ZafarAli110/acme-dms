import { InputAdornment, TextField } from "@mui/material";
import { type Ref, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { currencySymbol, formatMoneyInput, parseMoneyCents } from "../core/formatters/formatMoney";

interface MoneyFieldProps {
  /** What the user typed, in their language ("45,50"); turned into cents with `parseMoneyCents` when it is sent. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  name?: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  /** On the field's root, as on every TextField here: e2e finds the input inside it. */
  testId?: string;
}

/**
 * An amount of money, typed the user's way (docs/standards/money.md). The field holds text, so "45,50" in French is
 * never read by the browser as a number; the currency symbol sits on the side the language puts it ("$" before in
 * English, after in French). Leaving the field writes a valid amount with two decimals ("45.5" → "45.50"), and
 * switching language rewrites it in the new one. Works as a react-hook-form Controller's field or with plain state.
 */
export function MoneyField({
  value,
  onChange,
  onBlur,
  inputRef,
  name,
  label,
  required,
  disabled,
  error,
  helperText,
  testId,
}: MoneyFieldProps) {
  const { i18n } = useTranslation();
  const { symbol, isPrefix } = currencySymbol(i18n.language);

  // On a language change, read the amount in the language it was typed in and write it in the new one.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const typedIn = useRef(i18n.language);
  useEffect(() => {
    const previous = typedIn.current;
    typedIn.current = i18n.language;
    if (previous === i18n.language) {
      return;
    }
    const cents = parseMoneyCents(latest.current.value, previous);
    if (cents !== null) {
      latest.current.onChange(formatMoneyInput(cents, i18n.language));
    }
  }, [i18n.language]);

  const leave = (): void => {
    const cents = parseMoneyCents(value, i18n.language);
    if (cents !== null) {
      onChange(formatMoneyInput(cents, i18n.language));
    }
    onBlur?.();
  };

  const adornment = <InputAdornment position={isPrefix ? "start" : "end"}>{symbol}</InputAdornment>;

  return (
    <TextField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={leave}
      inputRef={inputRef}
      name={name}
      label={label}
      required={required}
      disabled={disabled}
      fullWidth
      error={error}
      helperText={helperText}
      data-testid={testId}
      slotProps={{
        input: isPrefix ? { startAdornment: adornment } : { endAdornment: adornment },
        htmlInput: { inputMode: "decimal" },
      }}
    />
  );
}
