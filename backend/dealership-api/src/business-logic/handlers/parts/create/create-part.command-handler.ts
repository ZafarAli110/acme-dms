import { localized } from "#i18n/messages";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { ICreatePartCommandHandler } from "#business-logic-abstractions/handlers/parts/create/create-part.command-handler.interface";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { PartCreateRequestDto } from "#dto/parts/part-create-request.dto";
import type { PartResponseDto } from "#dto/parts/part-response.dto";
import { bins } from "#persistence/schema/bins";
import { partInventories } from "#persistence/schema/part-inventories";
import { parts } from "#persistence/schema/parts";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { createdAudit } from "../../../audit/audit-fields";
import { requireLocation } from "../../../user-context/require-location";
import { toPartResponseDto } from "../part.mapper";

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
      .where(and(eq(bins.id, request.binId)));
    if (!bin) {
      throw new BadRequestException(localized("errors.binNotAtLocation", { binId: request.binId }));
    }
    const [taken] = await work.db
      .select({ id: parts.id })
      .from(parts)
      .where(and(eq(parts.partNumber, request.partNumber)));
    if (taken) {
      throw new ConflictException(localized("errors.partNumberExists", { partNumber: request.partNumber }));
    }

    const audit = createdAudit(userContext.userId, this._clock.now());
    const [part] = await work.db
      .insert(parts)
      .values({
        dealerId: userContext.dealerId,
        partNumber: request.partNumber,
        description: request.description,
        unitPriceCents: request.unitPriceCents,
        ...audit,
      })
      .returning();
    const [inventory] = await work.db
      .insert(partInventories)
      .values({
        dealerId: userContext.dealerId,
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
