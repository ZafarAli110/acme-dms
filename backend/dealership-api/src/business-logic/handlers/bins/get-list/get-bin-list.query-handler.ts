import { Inject, Injectable } from "@nestjs/common";
import { asc } from "drizzle-orm";
import type { IGetBinListQueryHandler } from "#business-logic-abstractions/handlers/bins/get-list/get-bin-list.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { BinResponseDto } from "#dto/bins/bin-response.dto";
import { bins } from "#persistence/schema/bins";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { requireLocation } from "../../../user-context/require-location";
import { toBinResponseDto } from "../bin.mapper";

/** The bins of the user's selected location, for the bin picker when stocking a part. */
@Injectable()
export class GetBinListQueryHandler implements IGetBinListQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext): Promise<BinResponseDto[]> {
    requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const rows = await work.db.select().from(bins).where(notDeleted(bins)).orderBy(asc(bins.code));
    return rows.map(toBinResponseDto);
  }
}
