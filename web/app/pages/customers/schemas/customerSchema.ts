import type {TFunction} from 'i18next';
import * as v from 'valibot';
import type {CustomerFormValues} from '../types/customer';

const NAME_MAX = 100;
const COMPANY_MAX = 200;
const EMAIL_MAX = 254;
const PHONE_MAX = 40;
const CITY_MAX = 100;
const EMAIL = v.pipe(v.string(), v.email());
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The customer form's rules (create and edit): the service's rules, checked before anything is sent. A factory,
 * because the messages are translated; call it once per language with useMemo.
 */
export function createCustomerSchema(t: TFunction<'customers'>) {
  function optionalText(max: number) {
    return v.pipe(v.string(), v.trim(), v.maxLength(max, t('validation.tooLong', {max})));
  }

  return v.object({
    firstName: v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty(t('validation.firstNameRequired')),
      v.maxLength(NAME_MAX, t('validation.tooLong', {max: NAME_MAX})),
    ),
    surname: v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty(t('validation.surnameRequired')),
      v.maxLength(NAME_MAX, t('validation.tooLong', {max: NAME_MAX})),
    ),
    companyName: optionalText(COMPANY_MAX),
    email: v.pipe(
      optionalText(EMAIL_MAX),
      v.check((email) => email === '' || v.is(EMAIL, email), t('validation.emailInvalid')),
    ),
    phone: optionalText(PHONE_MAX),
    city: optionalText(CITY_MAX),
    status: v.picklist(['active', 'prospect', 'inactive']),
    lastContactDate: v.pipe(
      v.string(),
      v.check((date) => date === '' || PLAIN_DATE.test(date), t('validation.dateInvalid')),
    ),
  }) satisfies v.GenericSchema<CustomerFormValues, unknown>;
}
