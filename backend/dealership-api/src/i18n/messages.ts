import { type I18nForRootOptions, I18nMessageFormatter, type I18nKey, InMemoryI18nLoader, t } from "@nestjs/i18n";
import { en, type Messages } from "./catalogs/en";
import { fr } from "./catalogs/fr";

// Every key is checked against the English catalog: `localized()`, `t()` and the validation messages alike.
declare module "@nestjs/i18n" {
  interface I18nTypes {
    translations: Messages;
  }
}

/** The languages the service answers in. A request asking for anything else gets English. */
export const CATALOGS = { en, fr };
export const DEFAULT_LOCALE = "en";

export type MessageKey = I18nKey;
export type MessageArgs = Record<string, string | number>;

/**
 * An exception body the problem-details filter translates into the request's language. `message` is the English
 * text, so `exception.message` (what logs, traces and tests read) stays English whatever the user asked for.
 */
export interface LocalizedMessage {
  message: string;
  i18n: { key: MessageKey; args: MessageArgs };
}

/** What a handler throws with: `new NotFoundException(localized("errors.customerNotFound", { customerId }))`. */
export function localized(key: MessageKey, args: MessageArgs = {}): LocalizedMessage {
  return { message: englishMessage(key, args), i18n: { key, args } };
}

export function isLocalizedMessage(value: unknown): value is LocalizedMessage {
  return typeof value === "object" && value !== null && "i18n" in value && "message" in value;
}

/** The message in the current request's language; English outside a request or for a key no catalog has. */
export function translateMessage(key: string, args: MessageArgs = {}): string {
  // `t()` reads the current request's language; outside a request it returns the key.
  const translated = t(key as MessageKey, { args });
  return translated === key ? englishMessage(key, args) : translated;
}

/** The English text of a key, filled in; the key itself when English has no such message. */
export function englishMessage(key: string, args: MessageArgs = {}): string {
  const message = lookup(en, key);
  return message === null ? key : fillPlaceholders(message, args, DEFAULT_LOCALE);
}

/**
 * Fills `{name}` placeholders. `{property}`, the field a validation message is about, is shown under the name the
 * screens give it in that language (`surname` → "Surname", "Nom"); a field the catalog does not name stays as it is.
 * A number is written as the language writes it.
 */
export function fillPlaceholders(message: string, args: Record<string, unknown>, locale: string): string {
  const catalog = catalogFor(locale);
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    if (!(name in args)) {
      return placeholder;
    }
    const value = args[name];
    if (name === "property" && typeof value === "string") {
      return lookup(catalog.fields, value) ?? value;
    }
    if (typeof value === "number") {
      // In the reader's language: 10,000 in English, 10 000 in French.
      return value.toLocaleString(locale);
    }
    return Array.isArray(value) ? value.join(", ") : String(value);
  });
}

/** The formatter `I18nModule` uses: the placeholders above, so field names are translated. */
export class FieldNameFormatter extends I18nMessageFormatter {
  public format(message: string, args: Record<string, unknown>, locale: string): string {
    return fillPlaceholders(message, args, locale);
  }
}

/**
 * `I18nModule.forRoot()`'s options, for the app and its tests alike. Each request's language comes from its
 * Accept-Language header (the web app sends the one the user chose); English when it asks for one we do not have.
 * The catalogs are TypeScript objects: nothing to copy into the build.
 */
export function i18nOptions(): I18nForRootOptions {
  return {
    loader: new InMemoryI18nLoader(CATALOGS),
    formatter: new FieldNameFormatter(),
    defaultLocale: DEFAULT_LOCALE,
  };
}

function catalogFor(locale: string): Messages {
  const language = locale.split("-")[0] ?? DEFAULT_LOCALE;
  return language in CATALOGS ? CATALOGS[language as keyof typeof CATALOGS] : en;
}

/** The message at a dotted key (`errors.customerNotFound`), or null. */
function lookup(catalog: object, key: string): string | null {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return null;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
}
