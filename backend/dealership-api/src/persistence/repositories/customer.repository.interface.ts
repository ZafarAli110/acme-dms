import type {Customer} from '../entities/customer.entity';
import type {NewEntity} from '../entities/generated-id';

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
  /** Inserts a new row (the database assigns its id) or updates an existing one; returns the row as saved. */
  saveAsync(dealerId: string, customer: Customer | NewEntity<Customer>): Promise<Customer>;
}

export const CUSTOMER_REPOSITORY = Symbol('ICustomerRepository');
