import {Controller, Get, Inject} from '@nestjs/common';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {
  GET_USER_CONTEXT_QUERY_HANDLER,
  type IGetUserContextQueryHandler,
} from '#business-logic-abstractions/handlers/system/get-user-context/get-user-context.query-handler.interface';
import {
  GET_HEALTH_QUERY_HANDLER,
  type IGetHealthQueryHandler,
} from '#business-logic-abstractions/handlers/system/get-health/get-health.query-handler.interface';
import type {UserContextResponseDto} from '#dto/system/user-context-response.dto';
import type {HealthCheckResponseDto} from '#dto/system/health-check-response.dto';
import {Public} from '../../authentication/public.decorator';
import {CurrentUser} from '../../authorization/current-user.decorator';

@Controller('v1/system')
export class SystemController {
  private readonly _getHealthQueryHandler: IGetHealthQueryHandler;
  private readonly _getUserContextQueryHandler: IGetUserContextQueryHandler;

  public constructor(
    @Inject(GET_HEALTH_QUERY_HANDLER) getHealthQueryHandler: IGetHealthQueryHandler,
    @Inject(GET_USER_CONTEXT_QUERY_HANDLER) getUserContextQueryHandler: IGetUserContextQueryHandler,
  ) {
    this._getHealthQueryHandler = getHealthQueryHandler;
    this._getUserContextQueryHandler = getUserContextQueryHandler;
  }

  @Public()
  @Get('health')
  public findHealthAsync(): Promise<HealthCheckResponseDto> {
    return this._getHealthQueryHandler.executeAsync();
  }

  /** Who the API thinks you are at the selected location: handy when a permission check surprises you. */
  @Get('user-context')
  public findUserContextAsync(@CurrentUser() userContext: UserContext): Promise<UserContextResponseDto> {
    return this._getUserContextQueryHandler.executeAsync(userContext);
  }
}
