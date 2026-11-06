import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
} from "@nestjs/common";
import { map, type Observable } from "rxjs";
import { etagOf, matchesIfNoneMatch, NotModifiedException, versionOf } from "../concurrency/record-version";

type EtagRequest = { method: string; headers: Record<string, string | string[] | undefined> };
type HeaderSetter = { setHeader(name: string, value: string): void };

/**
 * An endpoint that answers one versioned record (one with `version`): it sends the record's ETag, so the client can
 * save with If-Match, and a GET whose If-None-Match names that ETag is answered 304 with no body. Its GET is the one
 * answer a browser may keep, and only to ask again (`Cache-Control: private, no-cache`); every other answer stays `no-store`.
 *
 *   @Get(":customerId") @ETagged()
 */
export function ETagged() {
  return UseInterceptors(ETagInterceptor);
}

@Injectable()
export class ETagInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<EtagRequest>();
    const response = http.getResponse<HeaderSetter>();
    return next.handle().pipe(
      map((body: unknown) => {
        const version = versionOf(body);
        if (version === null) {
          return body;
        }
        const etag = etagOf(version);
        response.setHeader("etag", etag);
        if (request.method === "GET") {
          // One record, one user's: the browser may keep it (`private`) but must ask before every use (`no-cache`), which
          // costs a 304 with no body when the version is the same. The server still runs the query and checks who is
          // asking, so a copy is never trusted without it. What differs by sign-in (a script's token, the browser's
          // session cookie) or location is not shared (`Vary`).
          response.setHeader("cache-control", "private, no-cache");
          response.setHeader("vary", "authorization, cookie, x-location-id");
          if (matchesIfNoneMatch(request.headers["if-none-match"], etag)) {
            throw new NotModifiedException(etag);
          }
        }
        return body;
      }),
    );
  }
}
