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
 * save with If-Match, and a GET whose If-None-Match names that ETag is answered 304 with no body.
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
        if (request.method === "GET" && matchesIfNoneMatch(request.headers["if-none-match"], etag)) {
          throw new NotModifiedException(etag);
        }
        return body;
      }),
    );
  }
}
