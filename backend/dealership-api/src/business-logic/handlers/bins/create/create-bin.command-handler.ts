import {ConflictException, Inject, Injectable} from '@nestjs/common';
import type {ICreateBinCommandHandler} from '#business-logic-abstractions/handlers/bins/create/create-bin.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {createdAudit} from '../../../audit/audit-fields';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {BinCreateRequestDto} from '#dto/bins/bin-create-request.dto';
import type {BinResponseDto} from '#dto/bins/bin-response.dto';
import type {Bin} from '#persistence/entities/bin.entity';
import {BIN_REPOSITORY, type IBinRepository} from '#persistence/repositories/bin.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toBinResponseDto} from '../bin.mapper';

/** Adds a bin to the user's selected location; bin codes are unique within a location. */
@Injectable()
export class CreateBinCommandHandler implements ICreateBinCommandHandler {
  private readonly _binRepository: IBinRepository;
  private readonly _clock: IClock;

  public constructor(@Inject(BIN_REPOSITORY) binRepository: IBinRepository, @Inject(CLOCK) clock: IClock) {
    this._binRepository = binRepository;
    this._clock = clock;
  }

  public async executeAsync(userContext: UserContext, request: BinCreateRequestDto): Promise<BinResponseDto> {
    const locationId = requireLocation(userContext);
    const existingBin = await this._binRepository.existsWithCodeAsync(userContext.dealerId, locationId, request.code);
    if (existingBin) {
      throw new ConflictException(`Bin ${request.code} already exists at this location.`);
    }
    const bin: Bin = {
      id: crypto.randomUUID(),
      dealerId: userContext.dealerId,
      locationId,
      code: request.code,
      description: request.description,
      ...createdAudit(userContext.userId, this._clock.now()),
    };
    await this._binRepository.saveAsync(userContext.dealerId, bin);
    return toBinResponseDto(bin);
  }
}
