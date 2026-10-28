import {Body, Controller, HttpCode, HttpStatus, Inject, Post} from '@nestjs/common';
import {
  CREATE_BIN_COMMAND_HANDLER,
  type ICreateBinCommandHandler,
} from '#business-logic-abstractions/handlers/bins/create/create-bin.command-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {BinCreateRequestDto} from '#dto/bins/bin-create-request.dto';
import type {BinResponseDto} from '#dto/bins/bin-response.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';

/** Changes to the bins of the location selected in `x-location-id`. Reads are in BinController. */
@Controller('v1/bins')
export class BinCommandController {
  private readonly _createBinCommandHandler: ICreateBinCommandHandler;

  public constructor(@Inject(CREATE_BIN_COMMAND_HANDLER) createBinCommandHandler: ICreateBinCommandHandler) {
    this._createBinCommandHandler = createBinCommandHandler;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('parts.write')
  public createAsync(
    @CurrentUser() userContext: UserContext,
    @Body() request: BinCreateRequestDto,
  ): Promise<BinResponseDto> {
    return this._createBinCommandHandler.executeAsync(userContext, request);
  }
}
