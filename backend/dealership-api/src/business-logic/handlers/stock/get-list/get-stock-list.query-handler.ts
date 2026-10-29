import {Inject, Injectable} from '@nestjs/common';
import type {IGetStockListQueryHandler} from '#business-logic-abstractions/handlers/stock/get-list/get-stock-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ListQueryDto} from '#dto/paging/list-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {requireLocation} from '../../../user-context/require-location';
import {findStockedPartsAsync} from '../../parts/part.queries';
import {toStockListItemDto} from '../stock.mapper';

/** Stock at the user's selected location. Stock is per location: never mix locations in one answer. */
@Injectable()
export class GetStockListQueryHandler implements IGetStockListQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PageResponseDto<StockListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
    const {items, total} = await findStockedPartsAsync(work.db, requireLocation(userContext), query);
    return {
      items: items.map(({part, inventory, bin}) => toStockListItemDto(part, inventory, bin)),
      total,
      page,
      pageSize,
    };
  }
}
