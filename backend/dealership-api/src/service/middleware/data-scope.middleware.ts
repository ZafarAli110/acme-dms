import { Injectable, type NestMiddleware } from "@nestjs/common";
import { runWithDataScope } from "#request-scope/data-scope";

/**
 * Gives every request a data scope of its own, empty until the authorization guard fills it in. Applied first, so
 * the guards, the handler and every unit of work it opens run inside it.
 */
@Injectable()
export class DataScopeMiddleware implements NestMiddleware {
  public use(_request: unknown, _response: unknown, next: () => void): void {
    runWithDataScope(next);
  }
}
