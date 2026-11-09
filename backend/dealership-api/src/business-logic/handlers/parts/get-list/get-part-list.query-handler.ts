import { Inject, Injectable } from "@nestjs/common";
import type { IGetPartListQueryHandler } from "#business-logic-abstractions/handlers/parts/get-list/get-part-list.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import type { PartPageResponseDto } from "#dto/parts/part-page-response.dto";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { timesCents } from "../../../money/money";
import { requireLocation } from "../../../user-context/require-location";
import { toPartInventoryDto } from "../part.mapper";
import {
  findMatchingPartIdsAsync,
  findStockedPartsAsync,
  findStockedPartsByIdsAsync,
  findThumbnailsAsync,
  type StockedPart,
} from "../part.queries";

/**
 * A page of the parts stocked at the user's selected location, with their bin and quantity there, and whether another
 * page follows; how many there are is `CountPartsQueryHandler`'s, asked once per question (ACME-124). A search finds
 * its page's ids as the tables' owner, with the scope written out (no index could serve it under row-level security),
 * and reads the rows as the request (ACME-123).
 */
@Injectable()
export class GetPartListQueryHandler implements IGetPartListQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PartPageResponseDto> {
    const locationId = requireLocation(userContext);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const { items, hasMore } = query.search
      ? await this.searchAsync(userContext.dealerId, locationId, query, query.search)
      : await this.listAsync(query);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const thumbnails = await findThumbnailsAsync(
      work.db,
      items.map(({ part }) => part.id),
    );

    return {
      items: items.map(({ part, inventory, bin }) => ({
        id: part.id,
        partNumber: part.partNumber,
        description: part.description,
        unitPriceCents: part.unitPriceCents,
        thumbnailDocumentId: thumbnails.get(part.id)?.documentId ?? null,
        inventory: toPartInventoryDto(inventory, bin),
        stockValueCents: timesCents(part.unitPriceCents, inventory.quantityOnHand),
      })),
      page,
      pageSize,
      hasMore,
    };
  }

  private async listAsync(query: ListQueryDto): Promise<{ items: StockedPart[]; hasMore: boolean }> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    // Awaited here: returned unawaited, the unit of work would close before it ran.
    return await findStockedPartsAsync(work.db, query);
  }

  private async searchAsync(
    dealerId: string,
    locationId: string,
    query: ListQueryDto,
    search: string,
  ): Promise<{ items: StockedPart[]; hasMore: boolean }> {
    const found = await this.findMatchingAsync(dealerId, locationId, query, search);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    return { items: await findStockedPartsByIdsAsync(work.db, found.ids), hasMore: found.hasMore };
  }

  private async findMatchingAsync(
    dealerId: string,
    locationId: string,
    query: ListQueryDto,
    search: string,
  ): Promise<{ ids: string[]; hasMore: boolean }> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner: true });
    return await findMatchingPartIdsAsync(work.db, { dealerId, locationId }, query, search);
  }
}
