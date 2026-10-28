import type {CustomerStatus} from './customer-response.dto';

export interface CustomerListItemDto {
  id: string;
  firstName: string;
  surname: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: CustomerStatus;
  lastContactDate: string | null;
}
