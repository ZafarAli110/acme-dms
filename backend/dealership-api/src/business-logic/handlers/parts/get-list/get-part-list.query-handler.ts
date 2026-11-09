import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { IGetPartListQueryHandler } from "#business-logic-abstractions/handlers/parts/get-list/get-part-list.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import type { PartPageResponseDto } from "#dto/parts/part-page-response.dto";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { localized } from "#i18n/messages";
import { SETTINGS, type Settings } from "#settings/settings";
import { CursorCodec, type KeyedRow, keysetMoveOf } from "../../../list-query/keyset";
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

  private readonly _cursorKey: string;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(SETTINGS) settings: Pick<Settings, "exportLinkKey">,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._cursorKey = settings.exportLinkKey;
  }

  public async executeAsync(userContext: UserContext, query: ListQueryDto): Promise<PartPageResponseDto> {
    const locationId = requireLocation(userContext);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const codec = new CursorCodec(this._cursorKey, { dealerId: userContext.dealerId, locationId }, query);
    const move = keysetMoveOf(query);
    if (move && query.search) {
      // A search pages by number (its best-match order mixes directions and a rank: ACME-129, D4).
      throw new BadRequestException(localized("errors.listCursorInvalid"));
    }
    const { items, hasMore, next, previous } = query.search
      ? {
          ...(await this.searchAsync(userContext.dealerId, locationId, query, query.search)),
          next: null,
          previous: null,
        }
      : await this.listAsync(query, codec);
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
      page: move ? null : page,
      pageSize,
      hasMore,
      next: next ? codec.encode(next) : null,
      previous: previous ? codec.encode(previous) : null,
    };
  }

  /** The list's page: by keyset after or before a cursor, or the last page; by its number otherwise (ACME-129). */
  private async listAsync(
    query: ListQueryDto,
    codec: CursorCodec,
  ): Promise<{ items: StockedPart[]; hasMore: boolean; next: KeyedRow | null; previous: KeyedRow | null }> {
    const move = keysetMoveOf(query);
    const cursor = move && !("last" in move) ? codec.decode("after" in move ? move.after : move.before) : null;
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    // Awaited here: returned unawaited, the unit of work would close before it ran.
    const found = await findStockedPartsAsync(work.db, query, move, cursor);
    return { ...found, hasMore: found.next !== null };
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
