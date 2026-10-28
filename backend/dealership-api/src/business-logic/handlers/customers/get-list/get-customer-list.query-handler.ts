import {Inject, Injectable} from '@nestjs/common';
import {and, asc, count, eq, ilike, or, type SQL} from 'drizzle-orm';
import type {IGetCustomerListQueryHandler} from '#business-logic-abstractions/handlers/customers/get-list/get-customer-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';
import type {PageQueryDto} from '#dto/paging/page-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import {customers, notDeleted} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toCustomerListItemDto} from '../customer.mapper';

/** Customers of the user's selected location; `search` matches name, company, email or phone. */
@Injectable()
export class GetCustomerListQueryHandler implements IGetCustomerListQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(
    userContext: UserContext,
    query: PageQueryDto,
  ): Promise<PageResponseDto<CustomerListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = and(
      eq(customers.locationId, requireLocation(userContext)),
      notDeleted(customers),
      query.search ? matching(`%${query.search}%`) : undefined,
    );

    await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
    const items = await work.db
      .select()
      .from(customers)
      .where(where)
      .orderBy(asc(customers.surname), asc(customers.firstName))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [counted] = await work.db.select({total: count()}).from(customers).where(where);
    const total = counted?.total ?? 0;
    return {items: items.map(toCustomerListItemDto), total, page, pageSize};
  }
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
