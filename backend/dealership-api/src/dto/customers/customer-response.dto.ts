export type CustomerStatus = 'active' | 'prospect' | 'inactive';

export interface CustomerResponseDto {
  id: string;
  locationId: string;
  firstName: string;
  surname: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: CustomerStatus;
  lastContactDate: string | null;
  createdAt: string;
  updatedAt: string;
}
