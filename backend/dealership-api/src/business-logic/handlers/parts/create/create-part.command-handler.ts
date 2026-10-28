import {BadRequestException, ConflictException, Inject, Injectable} from '@nestjs/common';
import {and, eq} from 'drizzle-orm';
import type {ICreatePartCommandHandler} from '#business-logic-abstractions/handlers/parts/create/create-part.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartCreateRequestDto} from '#dto/parts/part-create-request.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import {bins, notDeleted, partInventories, parts} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {createdAudit} from '../../../audit/audit-fields';
import {requireLocation} from '../../../user-context/require-location';
import {toPartResponseDto} from '../part.mapper';

/** Adds a part to the catalogue and stocks it at the selected location, in a bin of that location. */
@Injectable()
export class CreatePartCommandHandler implements ICreatePartCommandHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
  }

  public async executeAsync(userContext: UserContext, request: PartCreateRequestDto): Promise<PartResponseDto> {
    const locationId = requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync();
    const [bin] = await work.db
      .select()
      .from(bins)
      .where(and(eq(bins.id, request.binId), eq(bins.locationId, locationId), notDeleted(bins)));
    if (!bin) {
      throw new BadRequestException(`Bin ${request.binId} is not a bin of this location; pick one from GET /v1/bins.`);
    }
    const [taken] = await work.db
      .select({id: parts.id})
      .from(parts)
      .where(and(eq(parts.partNumber, request.partNumber), notDeleted(parts)));
    if (taken) {
      throw new ConflictException(`Part number ${request.partNumber} already exists in your catalogue.`);
    }

    const audit = createdAudit(userContext.userId, this._clock.now());
    const [part] = await work.db
      .insert(parts)
      .values({
        partNumber: request.partNumber,
        description: request.description,
        unitPrice: request.unitPrice,
        ...audit,
      })
      .returning();
    const [inventory] = await work.db
      .insert(partInventories)
      .values({
        locationId,
        partId: part!.id,
        binId: bin.id,
        quantityOnHand: request.quantityOnHand,
        reorderLevel: request.reorderLevel,
        ...audit,
      })
      .returning();
    await work.commitAsync();
    return toPartResponseDto(part!, inventory!, bin, []);
  }
}
