import {Controller, Get, Inject} from '@nestjs/common';
import {
  GET_BIN_LIST_QUERY_HANDLER,
  type IGetBinListQueryHandler,
} from '#business-logic-abstractions/handlers/bins/get-list/get-bin-list.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {BinResponseDto} from '#dto/bins/bin-response.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';

/** Reads of the bins of the location selected in `x-location-id`. Writes are in BinCommandController. */
@Controller('v1/bins')
export class BinController {
  private readonly _getBinListQueryHandler: IGetBinListQueryHandler;

  public constructor(@Inject(GET_BIN_LIST_QUERY_HANDLER) getBinListQueryHandler: IGetBinListQueryHandler) {
    this._getBinListQueryHandler = getBinListQueryHandler;
  }

  @Get()
  @RequirePermission('parts.read')
  public findAllAsync(@CurrentUser() userContext: UserContext): Promise<BinResponseDto[]> {
    return this._getBinListQueryHandler.executeAsync(userContext);
  }
}
