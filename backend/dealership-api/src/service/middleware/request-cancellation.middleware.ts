import {Injectable, type NestMiddleware} from '@nestjs/common';
import {ResilienceContext} from '@nestjs/resilience';

type Response = {once(event: 'close', listener: () => void): unknown; readonly writableFinished: boolean};

/**
 * Node's answer to .NET's request CancellationToken. When the caller goes away before the answer is sent (a closed
 * tab, a cancelled fetch, a proxy that gave up), the request's signal aborts. The rest of the request runs inside it
 * (@nestjs/resilience's context, carried by AsyncLocalStorage), so every call made through a resilience policy, such
 * as the calls to document-api, stops too, and so does the controller's @Timeout() attempt; a handler can read the
 * signal with @Signal(). Postgres queries cannot be cancelled from Node: DATABASE_STATEMENT_TIMEOUT limits them.
 */
@Injectable()
export class RequestCancellationMiddleware implements NestMiddleware {
  private readonly _resilienceContext: ResilienceContext;

  public constructor(resilienceContext: ResilienceContext) {
    this._resilienceContext = resilienceContext;
  }

  public use(_request: unknown, response: Response, next: () => void): void {
    const cancellation = new AbortController();
    response.once('close', () => {
      if (!response.writableFinished) {
        cancellation.abort(new Error('The caller went away before the answer was sent.'));
      }
    });
    this._resilienceContext.run({signal: cancellation.signal}, next);
  }
}
