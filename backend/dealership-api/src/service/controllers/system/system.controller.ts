import { Controller, Get, Header, HttpCode, HttpStatus, Inject, Post } from "@nestjs/common";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import {
  GET_USER_CONTEXT_QUERY_HANDLER,
  type IGetUserContextQueryHandler,
} from "#business-logic-abstractions/handlers/system/get-user-context/get-user-context.query-handler.interface";
import {
  GET_HEALTH_QUERY_HANDLER,
  type IGetHealthQueryHandler,
} from "#business-logic-abstractions/handlers/system/get-health/get-health.query-handler.interface";
import type { UserContextResponseDto } from "#dto/system/user-context-response.dto";
import type { HealthCheckResponseDto } from "#dto/system/health-check-response.dto";
import { Public } from "../../authentication/public.decorator";
import { CurrentUser } from "../../authorization/current-user.decorator";
import { Timeout } from "@nestjs/resilience";

@Timeout()
@Controller("v1/system")
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
  @Get("health")
  public findHealthAsync(): Promise<HealthCheckResponseDto> {
    return this._getHealthQueryHandler.executeAsync();
  }

  /**
   * Sign-out asks the browser to drop what it kept of this site's answers (`Clear-Site-Data: "cache"`): a record's GET
   * may be kept to be revalidated (`@ETagged()`), and the next person at a shared machine must not find it on disk.
   * Public, because the token is already gone when it is called; it reads and changes nothing.
   */
  @Public()
  @Post("sign-out")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Clear-Site-Data", '"cache"')
  public signOut(): void {
    // Nothing to do here: the header is the answer.
  }

  /** Who the API thinks you are at the selected location: handy when a permission check surprises you. */
  @Get("user-context")
  public findUserContextAsync(@CurrentUser() userContext: UserContext): Promise<UserContextResponseDto> {
    return this._getUserContextQueryHandler.executeAsync(userContext);
  }
}
