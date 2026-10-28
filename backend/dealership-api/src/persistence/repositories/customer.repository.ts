import type {DataSource} from 'typeorm';
import {Customer} from '../entities/customer.entity';
import type {NewEntity} from '../entities/generated-id';
import type {CustomerPage, ICustomerRepository} from './customer.repository.interface';
import {DealerScopedRepository} from './dealer-scoped.repository';

export class CustomerRepository extends DealerScopedRepository<Customer> implements ICustomerRepository {
  public constructor(dataSource: DataSource) {
    super(dataSource.getRepository(Customer), 'customer');
  }

  public async findPageForLocationAsync(
    dealerId: string,
    locationId: string,
    search: string | null,
    page: number,
    pageSize: number,
  ): Promise<CustomerPage> {
    const query = this.forDealer(dealerId)
      .andWhere('customer.locationId = :locationId', {locationId})
      .orderBy('customer.surname', 'ASC')
      .addOrderBy('customer.firstName', 'ASC');
    if (search) {
      query.andWhere(
        `(customer.firstName ILIKE :search OR customer.surname ILIKE :search OR customer.companyName ILIKE :search
          OR customer.email ILIKE :search OR customer.phone ILIKE :search)`,
        {search: `%${search}%`},
      );
    }
    const [items, total] = await query
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {items, total};
  }

  public findByIdAsync(dealerId: string, locationId: string, customerId: string): Promise<Customer | null> {
    return this.forDealer(dealerId)
      .andWhere('customer.locationId = :locationId', {locationId})
      .andWhere('customer.id = :customerId', {customerId})
      .getOne();
  }

  public findRecentlyContactedAsync(dealerId: string, limit: number): Promise<Customer[]> {
    return this.forDealer(dealerId)
      .andWhere('customer.lastContactDate IS NOT NULL')
      .orderBy('customer.lastContactDate', 'DESC')
      .addOrderBy('customer.surname', 'ASC')
      .take(limit)
      .getMany();
  }

  public saveAsync(dealerId: string, customer: Customer | NewEntity<Customer>): Promise<Customer> {
    this.assertSameDealer(dealerId, customer);
    return this._repository.save(customer);
  }
}
