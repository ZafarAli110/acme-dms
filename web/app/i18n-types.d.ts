import 'i18next';
import type common from './locales/en/common.json';
import type customers from './locales/en/customers.json';
import type home from './locales/en/home.json';
import type locations from './locales/en/locations.json';
import type navigation from './locales/en/navigation.json';
import type parts from './locales/en/parts.json';
import type signIn from './locales/en/sign-in.json';

// English is the reference: a key missing from it is a type error wherever t() uses it.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      customers: typeof customers;
      home: typeof home;
      locations: typeof locations;
      navigation: typeof navigation;
      parts: typeof parts;
      'sign-in': typeof signIn;
    };
  }
}
