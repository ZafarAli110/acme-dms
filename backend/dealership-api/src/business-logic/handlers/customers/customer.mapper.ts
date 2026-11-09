import type { CustomerListItemDto } from "#dto/customers/customer-list-item.dto";
import type { CustomerResponseDto } from "#dto/customers/customer-response.dto";
import { customers, type Customer } from "#persistence/schema/customers";
import { toIsoString } from "#business-logic-abstractions/time/to-iso-string";

/**
 * The columns a list item shows, for the lists to read and nothing else (ACME-129): reading the whole row parsed its
 * created and updated times into `Temporal.Instant`s (2 µs each under Node's polyfill) only to drop them.
 */
export const CUSTOMER_LIST_ITEM_COLUMNS = {
  id: customers.id,
  firstName: customers.firstName,
  surname: customers.surname,
  companyName: customers.companyName,
  email: customers.email,
  phone: customers.phone,
  city: customers.city,
  status: customers.status,
  lastContactDate: customers.lastContactDate,
};

/** A customer as a list shows it. */
export type CustomerListItemRow = Pick<Customer, keyof typeof CUSTOMER_LIST_ITEM_COLUMNS>;

export function toCustomerListItemDto(customer: CustomerListItemRow): CustomerListItemDto {
  return {
    id: customer.id,
    firstName: customer.firstName,
    surname: customer.surname,
    companyName: customer.companyName,
    email: customer.email,
    phone: customer.phone,
    city: customer.city,
    status: customer.status,
    lastContactDate: customer.lastContactDate?.toString() ?? null,
  };
}

export function toCustomerResponseDto(customer: Customer): CustomerResponseDto {
  return {
    ...toCustomerListItemDto(customer),
    locationId: customer.locationId,
    createdAt: toIsoString(customer.createdAt),
    updatedAt: toIsoString(customer.updatedAt),
    version: customer.version,
  };
}
