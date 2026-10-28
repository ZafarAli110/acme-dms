import i18next, {type i18n as I18nInstance} from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {initReactI18next} from 'react-i18next';
import enCommon from './locales/en/common.json';
import enCustomers from './locales/en/customers.json';
import enHome from './locales/en/home.json';
import enNavigation from './locales/en/navigation.json';
import enParts from './locales/en/parts.json';
import enSignIn from './locales/en/sign-in.json';
import frCommon from './locales/fr/common.json';
import frCustomers from './locales/fr/customers.json';
import frHome from './locales/fr/home.json';
import frNavigation from './locales/fr/navigation.json';
import frParts from './locales/fr/parts.json';
import frSignIn from './locales/fr/sign-in.json';

/** The languages the app is translated into. Labels are in the language itself, not translated. */
export const LANGUAGES = [
  {code: 'en', label: 'English'},
  {code: 'fr', label: 'Français'},
] as const;

// One namespace per feature (the feature folder's name), plus `common` and `navigation` for the app shell. Every
// string the user sees goes through t(); a new namespace is added here and in i18n-types.d.ts.
export const i18n: I18nInstance = i18next.createInstance();

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    initAsync: false,
    resources: {
      en: {
        common: enCommon,
        customers: enCustomers,
        home: enHome,
        navigation: enNavigation,
        parts: enParts,
        'sign-in': enSignIn,
      },
      fr: {
        common: frCommon,
        customers: frCustomers,
        home: frHome,
        navigation: frNavigation,
        parts: frParts,
        'sign-in': frSignIn,
      },
    },
    supportedLngs: LANGUAGES.map((language) => language.code),
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: 'en',
    defaultNS: 'common',
    fallbackNS: 'common',
    ns: ['common', 'customers', 'home', 'navigation', 'parts', 'sign-in'],
    interpolation: {
      // React escapes what it renders.
      escapeValue: false,
    },
    detection: {
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lng',
      lookupLocalStorage: 'acme.language',
      caches: ['localStorage'],
    },
  });

// <html lang> follows the language (screen readers, spelling, number input). The page shell is rendered once at build
// time, so it is set here rather than by React.
function setDocumentLanguage(language: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
}
setDocumentLanguage(i18n.resolvedLanguage ?? 'en');
i18n.on('languageChanged', () => setDocumentLanguage(i18n.resolvedLanguage ?? 'en'));
