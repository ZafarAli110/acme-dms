import type { CustomerRequest } from "./customer-request.schema";

/** A new customer of the location selected in `x-location-id`; same fields as an update. */
export type CustomerCreateRequestDto = CustomerRequest;
