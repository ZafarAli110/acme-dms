import {Inject, Injectable} from '@nestjs/common';
import type {IGetPartListQueryHandler} from '#business-logic-abstractions/handlers/parts/get-list/get-part-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ListQueryDto} from '#dto/paging/list-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {PartListItemDto} from '#dto/parts/part-list-item.dto';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toPartInventoryDto} from '../part.mapper';
import {findStockedPartsAsync, findThumbnailsAsync} from '../part.queries';

/** The parts stocked at the user's selected location, with their bin and quantity there. */
@Injectable()
export class GetPartListQueryHandler implements IGetPartListQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PageResponseDto<PartListItemDto>> {
    const locationId = requireLocation(userContext);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
    const {items, total} = await findStockedPartsAsync(work.db, locationId, query);
    const thumbnails = await findThumbnailsAsync(
      work.db,
      items.map(({part}) => part.id),
    );

    return {
      items: items.map(({part, inventory, bin}) => ({
        id: part.id,
        partNumber: part.partNumber,
        description: part.description,
        unitPrice: part.unitPrice,
        thumbnailDocumentId: thumbnails.get(part.id)?.documentId ?? null,
        inventory: toPartInventoryDto(inventory, bin),
      })),
      total,
      page,
      pageSize,
    };
  }
}
