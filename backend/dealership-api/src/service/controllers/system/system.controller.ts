import type { ServerResponse } from "node:http";
import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
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

  /**
   * Liveness: 200 while the process answers at all. It never touches the database, so an orchestrator restarts a copy
   * only when the process itself is stuck, never because the database is slow or down: that would restart every copy
   * at once (the NestJS production checklist, 17; ACME-121). Readiness is `health`.
   */
  @Public()
  @Get("alive")
  public findAlive(): { service: string; status: "alive" } {
    return { service: "dealership-api", status: "alive" };
  }

  /**
   * Readiness: 200 when it can do its work, 503 when degraded: the status code is what Aspire and a load balancer read.
   * The database check runs on a connection of its own, so a full pool on a busy morning does not make it red.
   */
  @Public()
  @Get("health")
  public async findHealthAsync(@Res({ passthrough: true }) response: ServerResponse): Promise<HealthCheckResponseDto> {
    const health = await this._getHealthQueryHandler.executeAsync();
    if (health.status !== "ok") {
      response.statusCode = HttpStatus.SERVICE_UNAVAILABLE;
    }
    return health;
  }

  /** Who the API thinks you are at the selected location: handy when a permission check surprises you. */
  @Get("user-context")
  public findUserContextAsync(@CurrentUser() userContext: UserContext): Promise<UserContextResponseDto> {
    return this._getUserContextQueryHandler.executeAsync(userContext);
  }
}
