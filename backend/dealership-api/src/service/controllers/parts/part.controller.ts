import {Controller, Get, Inject, Param, ParseUUIDPipe, Query} from '@nestjs/common';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {
  GET_PART_LIST_QUERY_HANDLER,
  type IGetPartListQueryHandler,
} from '#business-logic-abstractions/handlers/parts/get-list/get-part-list.query-handler.interface';
import {
  GET_PART_QUERY_HANDLER,
  type IGetPartQueryHandler,
} from '#business-logic-abstractions/handlers/parts/get/get-part.query-handler.interface';
import {ListQueryDto} from '#dto/paging/list-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import type {PartListItemDto} from '#dto/parts/part-list-item.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';

/** Reads of the parts catalogue. Writes are in PartCommandController. */
@Controller('v1/parts')
export class PartController {
  private readonly _getPartListQueryHandler: IGetPartListQueryHandler;
  private readonly _getPartQueryHandler: IGetPartQueryHandler;

  public constructor(
    @Inject(GET_PART_LIST_QUERY_HANDLER) getPartListQueryHandler: IGetPartListQueryHandler,
    @Inject(GET_PART_QUERY_HANDLER) getPartQueryHandler: IGetPartQueryHandler,
  ) {
    this._getPartListQueryHandler = getPartListQueryHandler;
    this._getPartQueryHandler = getPartQueryHandler;
  }

  @Get()
  @RequirePermission('parts.read')
  public findAllAsync(
    @CurrentUser() userContext: UserContext,
    @Query() query: ListQueryDto,
  ): Promise<PageResponseDto<PartListItemDto>> {
    return this._getPartListQueryHandler.executeAsync(userContext, query);
  }

  @Get(':partId')
  @RequirePermission('parts.read')
  public findOneAsync(
    @CurrentUser() userContext: UserContext,
    @Param('partId', ParseUUIDPipe) partId: string,
  ): Promise<PartResponseDto> {
    return this._getPartQueryHandler.executeAsync(userContext, partId);
  }
}
