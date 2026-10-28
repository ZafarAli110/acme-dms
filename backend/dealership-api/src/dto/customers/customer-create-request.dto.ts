import {CustomerUpdateRequestDto} from './customer-update-request.dto';

/** A new customer of the location selected in `x-location-id`; same fields as an update. */
export class CustomerCreateRequestDto extends CustomerUpdateRequestDto {}
