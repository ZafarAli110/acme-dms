import {Inject, Injectable} from '@nestjs/common';
import type {IGetBinListQueryHandler} from '#business-logic-abstractions/handlers/bins/get-list/get-bin-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {BinResponseDto} from '#dto/bins/bin-response.dto';
import {BIN_REPOSITORY, type IBinRepository} from '#persistence/repositories/bin.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toBinResponseDto} from '../bin.mapper';

/** The bins of the user's selected location, for the bin picker when stocking a part. */
@Injectable()
export class GetBinListQueryHandler implements IGetBinListQueryHandler {
  private readonly _binRepository: IBinRepository;

  public constructor(@Inject(BIN_REPOSITORY) binRepository: IBinRepository) {
    this._binRepository = binRepository;
  }

  public async executeAsync(userContext: UserContext): Promise<BinResponseDto[]> {
    const bins = await this._binRepository.findForLocationAsync(userContext.dealerId, requireLocation(userContext));
    return bins.map(toBinResponseDto);
  }
}
