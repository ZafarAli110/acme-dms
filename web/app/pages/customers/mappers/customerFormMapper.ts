import type {CustomerFormValues, CustomerInput} from '../types/customer';

/** The form's starting values: the customer as saved, or an empty new customer. */
export function toFormValues(customer: CustomerInput | null): CustomerFormValues {
  return {
    firstName: customer?.firstName ?? '',
    surname: customer?.surname ?? '',
    companyName: customer?.companyName ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    city: customer?.city ?? '',
    status: customer?.status ?? 'prospect',
    lastContactDate: customer?.lastContactDate ?? '',
  };
}

/** The request body for create (POST) and edit (PUT): every field is sent, and a field left empty is `null`. */
export function toCustomerInput(values: CustomerFormValues): CustomerInput {
  return {
    firstName: values.firstName.trim(),
    surname: values.surname.trim(),
    companyName: emptyToNull(values.companyName),
    email: emptyToNull(values.email),
    phone: emptyToNull(values.phone),
    city: emptyToNull(values.city),
    status: values.status,
    lastContactDate: emptyToNull(values.lastContactDate),
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
