import {Inject, Injectable} from '@nestjs/common';
import {and, asc, count, eq, ilike, or, sql, type SQL} from 'drizzle-orm';
import type {IGetCustomerListQueryHandler} from '#business-logic-abstractions/handlers/customers/get-list/get-customer-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';
import type {ListQueryDto} from '#dto/paging/list-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import {customers, notDeleted} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {listFilter, listOrderBy, type ListColumns} from '../../../list-query/list-columns';
import {requireLocation} from '../../../user-context/require-location';
import {toCustomerListItemDto} from '../customer.mapper';

/** What the customer list can be sorted and filtered by: the grid's field names. */
export const CUSTOMER_LIST_COLUMNS: ListColumns = {
  // "Surname, First name": sorts by surname, and a filter on the name matches either.
  name: {source: sql`${customers.surname} || ', ' || ${customers.firstName}`, type: 'text'},
  companyName: {source: customers.companyName, type: 'text'},
  email: {source: customers.email, type: 'text'},
  phone: {source: customers.phone, type: 'text'},
  city: {source: customers.city, type: 'text'},
  status: {source: customers.status, type: 'choice'},
  lastContactDate: {source: customers.lastContactDate, type: 'date'},
};

/**
 * Customers of the user's selected location, by name unless the query sorts otherwise; `search` matches name,
 * company, email or phone, and the query's filter narrows it further.
 */
@Injectable()
export class GetCustomerListQueryHandler implements IGetCustomerListQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(
    userContext: UserContext,
    query: ListQueryDto,
  ): Promise<PageResponseDto<CustomerListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = customerListWhere(requireLocation(userContext), query);

    await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
    const items = await work.db
      .select()
      .from(customers)
      .where(where)
      .orderBy(...customerListOrderBy(query))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [counted] = await work.db.select({total: count()}).from(customers).where(where);
    const total = counted?.total ?? 0;
    return {items: items.map(toCustomerListItemDto), total, page, pageSize};
  }
}

/**
 * The customers a list query shows at `locationId`: the location's, not deleted, searched and filtered. Shared with the
 * export, so the file holds exactly the rows the list shows.
 */
export function customerListWhere(locationId: string, query: ListQueryDto): SQL | undefined {
  return and(
    eq(customers.locationId, locationId),
    notDeleted(customers),
    query.search ? matching(`%${query.search}%`) : undefined,
    listFilter(CUSTOMER_LIST_COLUMNS, query),
  );
}

/** The list's order: the query's sort, else by name; always ending with the id, so equal values keep one order. */
export function customerListOrderBy(query: ListQueryDto): SQL[] {
  return listOrderBy(
    CUSTOMER_LIST_COLUMNS,
    query,
    [asc(customers.surname), asc(customers.firstName)],
    [asc(customers.id)],
  );
}

function matching(pattern: string): SQL | undefined {
  return or(
    ilike(customers.firstName, pattern),
    ilike(customers.surname, pattern),
    ilike(customers.companyName, pattern),
    ilike(customers.email, pattern),
    ilike(customers.phone, pattern),
  );
}
