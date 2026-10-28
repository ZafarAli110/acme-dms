import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';
import type {Customer} from '#persistence/schema/index';
import {toIsoString} from '#business-logic-abstractions/time/to-iso-string';

export function toCustomerListItemDto(customer: Customer): CustomerListItemDto {
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
  };
}
