import type { IncomingMessage, ServerResponse } from "node:http";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { runWithDataScope } from "#request-scope/data-scope";

/** Methods that only read: everything else saves, and uses the connections kept for saves (ACME-121). */
const READS = new Set(["GET", "HEAD"]);

/**
 * Gives every request a data scope of its own, empty until the authorization guard fills it in. Applied first, so
 * the guards, the handler and every unit of work it opens run inside it. It also says whether the request saves, and
 * aborts when the response closes before it was finished (the caller went away: a closed page, a client's timeout), so
 * the request's running statement is cancelled instead of finishing for nobody (ACME-121).
 */
@Injectable()
export class DataScopeMiddleware implements NestMiddleware {
  public use(request: IncomingMessage, response: ServerResponse, next: () => void): void {
    const callerGone = new AbortController();
    response.once("close", () => {
      if (!response.writableFinished) {
        callerGone.abort(new Error("The caller went away before the answer was sent."));
      }
    });
    runWithDataScope(next, {
      saves: !READS.has(request.method ?? "GET"),
      signal: callerGone.signal,
      connectBy: null,
      committed: false,
    });
  }
}
