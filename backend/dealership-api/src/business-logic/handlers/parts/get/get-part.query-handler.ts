import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import type {IGetPartQueryHandler} from '#business-logic-abstractions/handlers/parts/get/get-part.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import {
  type IPartInventoryRepository,
  PART_INVENTORY_REPOSITORY,
} from '#persistence/repositories/part-inventory.repository.interface';
import {
  type IPartPhotoRepository,
  PART_PHOTO_REPOSITORY,
} from '#persistence/repositories/part-photo.repository.interface';
import {type IPartRepository, PART_REPOSITORY} from '#persistence/repositories/part.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toPartResponseDto} from '../part.mapper';

/** A part as stocked at the selected location; a part the location does not stock is not found there. */
@Injectable()
export class GetPartQueryHandler implements IGetPartQueryHandler {
  private readonly _partRepository: IPartRepository;
  private readonly _partInventoryRepository: IPartInventoryRepository;
  private readonly _partPhotoRepository: IPartPhotoRepository;

  public constructor(
    @Inject(PART_REPOSITORY) partRepository: IPartRepository,
    @Inject(PART_INVENTORY_REPOSITORY) partInventoryRepository: IPartInventoryRepository,
    @Inject(PART_PHOTO_REPOSITORY) partPhotoRepository: IPartPhotoRepository,
  ) {
    this._partRepository = partRepository;
    this._partInventoryRepository = partInventoryRepository;
    this._partPhotoRepository = partPhotoRepository;
  }

  public async executeAsync(userContext: UserContext, partId: string): Promise<PartResponseDto> {
    const locationId = requireLocation(userContext);
    const part = await this._partRepository.findByIdAsync(userContext.dealerId, partId);
    const stocked = part
      ? await this._partInventoryRepository.findForPartAsync(userContext.dealerId, locationId, partId)
      : null;
    if (!part || !stocked) {
      throw new NotFoundException(`Part ${partId} is not stocked at this location.`);
    }
    const photos = await this._partPhotoRepository.findForPartAsync(userContext.dealerId, partId);
    return toPartResponseDto(part, stocked.inventory, stocked.bin, photos);
  }
}
