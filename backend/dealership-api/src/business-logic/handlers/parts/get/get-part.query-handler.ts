import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import type {IGetPartQueryHandler} from '#business-logic-abstractions/handlers/parts/get/get-part.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toPartResponseDto} from '../part.mapper';
import {findPhotosAsync, findStockedPartAsync} from '../part.queries';

/** A part as stocked at the selected location; a part the location does not stock is not found there. */
@Injectable()
export class GetPartQueryHandler implements IGetPartQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext, partId: string): Promise<PartResponseDto> {
    const locationId = requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
    const stocked = await findStockedPartAsync(work.db, locationId, partId);
    if (!stocked) {
      throw new NotFoundException(`Part ${partId} is not stocked at this location.`);
    }
    const photos = await findPhotosAsync(work.db, partId);
    return toPartResponseDto(stocked.part, stocked.inventory, stocked.bin, photos);
  }
}
