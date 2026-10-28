import type {Customer} from '../entities/customer.entity';

export interface CustomerPage {
  items: Customer[];
  total: number;
}

/** Customers belong to one location: every method takes the location explicitly. */
export interface ICustomerRepository {
  findPageForLocationAsync(
    dealerId: string,
    locationId: string,
    search: string | null,
    page: number,
    pageSize: number,
  ): Promise<CustomerPage>;
  findByIdAsync(dealerId: string, locationId: string, customerId: string): Promise<Customer | null>;
  /** The customers contacted most recently, newest first. */
  findRecentlyContactedAsync(dealerId: string, limit: number): Promise<Customer[]>;
  saveAsync(dealerId: string, customer: Customer): Promise<Customer>;
}

export const CUSTOMER_REPOSITORY = Symbol('ICustomerRepository');
