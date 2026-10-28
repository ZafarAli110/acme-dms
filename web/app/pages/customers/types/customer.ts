export type CustomerStatus = 'active' | 'prospect' | 'inactive';

/** Every field is always sent; a value the customer does not have is `null`. */
export interface CustomerInput {
  firstName: string;
  surname: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: CustomerStatus;
  lastContactDate: string | null;
}

export interface CustomerListItem extends CustomerInput {
  id: string;
}

export interface Customer extends CustomerListItem {
  locationId: string;
  createdAt: string;
  updatedAt: string;
}
