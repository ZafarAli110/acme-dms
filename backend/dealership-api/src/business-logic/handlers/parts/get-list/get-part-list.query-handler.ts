import {Inject, Injectable} from '@nestjs/common';
import type {IGetPartListQueryHandler} from '#business-logic-abstractions/handlers/parts/get-list/get-part-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PageQueryDto} from '#dto/paging/page-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {PartListItemDto} from '#dto/parts/part-list-item.dto';
import {
  type IPartInventoryRepository,
  PART_INVENTORY_REPOSITORY,
} from '#persistence/repositories/part-inventory.repository.interface';
import {
  type IPartPhotoRepository,
  PART_PHOTO_REPOSITORY,
} from '#persistence/repositories/part-photo.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toPartInventoryDto} from '../part.mapper';

/** The parts stocked at the user's selected location, with their bin and quantity there. */
@Injectable()
export class GetPartListQueryHandler implements IGetPartListQueryHandler {
  private readonly _partInventoryRepository: IPartInventoryRepository;
  private readonly _partPhotoRepository: IPartPhotoRepository;

  public constructor(
    @Inject(PART_INVENTORY_REPOSITORY) partInventoryRepository: IPartInventoryRepository,
    @Inject(PART_PHOTO_REPOSITORY) partPhotoRepository: IPartPhotoRepository,
  ) {
    this._partInventoryRepository = partInventoryRepository;
    this._partPhotoRepository = partPhotoRepository;
  }

  public async executeAsync(userContext: UserContext, query: PageQueryDto): Promise<PageResponseDto<PartListItemDto>> {
    const locationId = requireLocation(userContext);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const {items, total} = await this._partInventoryRepository.findPageForLocationAsync(
      userContext.dealerId,
      locationId,
      query.search ?? null,
      page,
      pageSize,
    );
    const thumbnails = await this._partPhotoRepository.findThumbnailsAsync(
      userContext.dealerId,
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
