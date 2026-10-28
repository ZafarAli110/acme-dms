import {ConflictException, Inject, Injectable} from '@nestjs/common';
import {and, eq} from 'drizzle-orm';
import type {ICreateBinCommandHandler} from '#business-logic-abstractions/handlers/bins/create/create-bin.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {BinCreateRequestDto} from '#dto/bins/bin-create-request.dto';
import type {BinResponseDto} from '#dto/bins/bin-response.dto';
import {bins, notDeleted} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {createdAudit} from '../../../audit/audit-fields';
import {requireLocation} from '../../../user-context/require-location';
import {toBinResponseDto} from '../bin.mapper';

/** Adds a bin to the user's selected location; bin codes are unique within a location. */
@Injectable()
export class CreateBinCommandHandler implements ICreateBinCommandHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
  }

  public async executeAsync(userContext: UserContext, request: BinCreateRequestDto): Promise<BinResponseDto> {
    const locationId = requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync();
    const [existing] = await work.db
      .select({id: bins.id})
      .from(bins)
      .where(and(eq(bins.locationId, locationId), eq(bins.code, request.code), notDeleted(bins)));
    if (existing) {
      throw new ConflictException(`Bin ${request.code} already exists at this location.`);
    }
    const [bin] = await work.db
      .insert(bins)
      .values({
        locationId,
        code: request.code,
        description: request.description,
        ...createdAudit(userContext.userId, this._clock.now()),
      })
      .returning();
    await work.commitAsync();
    return toBinResponseDto(bin!);
  }
}
