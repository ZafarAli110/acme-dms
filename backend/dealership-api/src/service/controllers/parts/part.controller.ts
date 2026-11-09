import { ETagged } from "../../interceptors/etag.interceptor";
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import {
  COUNT_PARTS_QUERY_HANDLER,
  type ICountPartsQueryHandler,
} from "#business-logic-abstractions/handlers/parts/count/count-parts.query-handler.interface";
import {
  GET_PART_LIST_QUERY_HANDLER,
  type IGetPartListQueryHandler,
} from "#business-logic-abstractions/handlers/parts/get-list/get-part-list.query-handler.interface";
import {
  GET_STOCK_VALUE_QUERY_HANDLER,
  type IGetStockValueQueryHandler,
} from "#business-logic-abstractions/handlers/parts/get-stock-value/get-stock-value.query-handler.interface";
import {
  GET_PART_QUERY_HANDLER,
  type IGetPartQueryHandler,
} from "#business-logic-abstractions/handlers/parts/get/get-part.query-handler.interface";
import { ListQuerySchema, type ListQueryDto } from "#dto/paging/list-query.dto";
import type { PartCountResponseDto } from "#dto/parts/part-count-response.dto";
import type { PartPageResponseDto } from "#dto/parts/part-page-response.dto";
import type { PartResponseDto } from "#dto/parts/part-response.dto";
import type { StockValueResponseDto } from "#dto/parts/stock-value-response.dto";
import { CurrentUser } from "../../authorization/current-user.decorator";
import { RequirePermission } from "../../authorization/require-permission.decorator";
import { Timeout } from "@nestjs/resilience";

/** Reads of the parts catalogue. Writes are in PartCommandController. */
@Timeout()
@Controller("v1/parts")
export class PartController {
  private readonly _countPartsQueryHandler: ICountPartsQueryHandler;
  private readonly _getPartListQueryHandler: IGetPartListQueryHandler;
  private readonly _getPartQueryHandler: IGetPartQueryHandler;
  private readonly _getStockValueQueryHandler: IGetStockValueQueryHandler;

  public constructor(
    @Inject(COUNT_PARTS_QUERY_HANDLER) countPartsQueryHandler: ICountPartsQueryHandler,
    @Inject(GET_PART_LIST_QUERY_HANDLER) getPartListQueryHandler: IGetPartListQueryHandler,
    @Inject(GET_PART_QUERY_HANDLER) getPartQueryHandler: IGetPartQueryHandler,
    @Inject(GET_STOCK_VALUE_QUERY_HANDLER) getStockValueQueryHandler: IGetStockValueQueryHandler,
  ) {
    this._countPartsQueryHandler = countPartsQueryHandler;
    this._getPartListQueryHandler = getPartListQueryHandler;
    this._getPartQueryHandler = getPartQueryHandler;
    this._getStockValueQueryHandler = getStockValueQueryHandler;
  }

  @Get()
  @RequirePermission("parts.read")
  public findAllAsync(
    @CurrentUser() userContext: UserContext,
    @Query({ schema: ListQuerySchema }) query: ListQueryDto,
  ): Promise<PartPageResponseDto> {
    return this._getPartListQueryHandler.executeAsync(userContext, query);
  }

  /**
   * How many parts the list's search and filter match, exactly: the web asks once per search and filter, not on every
   * page (ACME-124); the page and the sort do not change it. Declared before `:partId` so it matches first.
   */
  @Get("count")
  @RequirePermission("parts.read")
  public countAsync(
    @CurrentUser() userContext: UserContext,
    @Query({ schema: ListQuerySchema }) query: ListQueryDto,
  ): Promise<PartCountResponseDto> {
    return this._countPartsQueryHandler.executeAsync(userContext, query);
  }

  /** What the stock at the selected location is worth, every part on every page of the list. Before `:partId`. */
  @Get("stock-value")
  @RequirePermission("parts.read")
  public getStockValueAsync(@CurrentUser() userContext: UserContext): Promise<StockValueResponseDto> {
    return this._getStockValueQueryHandler.executeAsync(userContext);
  }

  @Get(":partId")
  @RequirePermission("parts.read")
  // Its photos and stock change without the part's version: never answered from the browser's copy.
  @ETagged({ revalidate: false })
  public findOneAsync(
    @CurrentUser() userContext: UserContext,
    @Param("partId", ParseUUIDPipe) partId: string,
  ): Promise<PartResponseDto> {
    return this._getPartQueryHandler.executeAsync(userContext, partId);
  }
}
