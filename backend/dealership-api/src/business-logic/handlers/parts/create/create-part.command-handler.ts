import {BadRequestException, ConflictException, Inject, Injectable} from '@nestjs/common';
import type {ICreatePartCommandHandler} from '#business-logic-abstractions/handlers/parts/create/create-part.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {createdAudit} from '../../../audit/audit-fields';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartCreateRequestDto} from '#dto/parts/part-create-request.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import type {PartInventory} from '#persistence/entities/part-inventory.entity';
import type {Part} from '#persistence/entities/part.entity';
import {BIN_REPOSITORY, type IBinRepository} from '#persistence/repositories/bin.repository.interface';
import {type IPartRepository, PART_REPOSITORY} from '#persistence/repositories/part.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toPartResponseDto} from '../part.mapper';

/** Adds a part to the dealer's catalogue and stocks it at the selected location, in a bin of that location. */
@Injectable()
export class CreatePartCommandHandler implements ICreatePartCommandHandler {
  private readonly _partRepository: IPartRepository;
  private readonly _binRepository: IBinRepository;
  private readonly _clock: IClock;

  public constructor(
    @Inject(PART_REPOSITORY) partRepository: IPartRepository,
    @Inject(BIN_REPOSITORY) binRepository: IBinRepository,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._partRepository = partRepository;
    this._binRepository = binRepository;
    this._clock = clock;
  }

  public async executeAsync(userContext: UserContext, request: PartCreateRequestDto): Promise<PartResponseDto> {
    const locationId = requireLocation(userContext);
    const bin = await this._binRepository.findByIdAsync(userContext.dealerId, locationId, request.binId);
    if (!bin) {
      throw new BadRequestException(`Bin ${request.binId} is not a bin of this location; pick one from GET /v1/bins.`);
    }
    if (await this._partRepository.existsWithPartNumberAsync(userContext.dealerId, request.partNumber)) {
      throw new ConflictException(`Part number ${request.partNumber} already exists in your catalogue.`);
    }

    const now = this._clock.now();
    const part: Part = {
      id: crypto.randomUUID(),
      dealerId: userContext.dealerId,
      partNumber: request.partNumber,
      description: request.description,
      unitPrice: request.unitPrice,
      ...createdAudit(userContext.userId, now),
    };
    const inventory: PartInventory = {
      id: crypto.randomUUID(),
      dealerId: userContext.dealerId,
      locationId,
      partId: part.id,
      binId: bin.id,
      quantityOnHand: request.quantityOnHand,
      reorderLevel: request.reorderLevel,
      ...createdAudit(userContext.userId, now),
    };
    await this._partRepository.createWithInventoryAsync(userContext.dealerId, part, inventory);
    return toPartResponseDto(part, inventory, bin, []);
  }
}
