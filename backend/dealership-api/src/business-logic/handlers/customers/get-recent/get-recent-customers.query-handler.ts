import {Inject, Injectable} from '@nestjs/common';
import {and, asc, desc, isNotNull} from 'drizzle-orm';
import type {IGetRecentCustomersQueryHandler} from '#business-logic-abstractions/handlers/customers/get-recent/get-recent-customers.query-handler.interface';
import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';
import {customers, notDeleted} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {toCustomerListItemDto} from '../customer.mapper';

/** How many customers the "Recently contacted" panel on the home page shows. */
export const RECENT_CUSTOMERS_LIMIT = 5;

/** The customers contacted most recently, newest first, for the home page. */
@Injectable()
export class GetRecentCustomersQueryHandler implements IGetRecentCustomersQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(): Promise<CustomerListItemDto[]> {
    await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
    const recent = await work.db
      .select()
      .from(customers)
      .where(and(isNotNull(customers.lastContactDate), notDeleted(customers)))
      .orderBy(desc(customers.lastContactDate), asc(customers.surname))
      .limit(RECENT_CUSTOMERS_LIMIT);
    return recent.map(toCustomerListItemDto);
  }
}
