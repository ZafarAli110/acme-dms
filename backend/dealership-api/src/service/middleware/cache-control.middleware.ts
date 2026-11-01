import {Injectable, type NestMiddleware} from '@nestjs/common';

type Response = {setHeader(name: string, value: string): void};

/**
 * Every answer is one dealer's data, for one signed-in user: no browser, proxy or CDN may keep a copy. An endpoint that
 * can be cached sets its own Cache-Control after this.
 */
@Injectable()
export class CacheControlMiddleware implements NestMiddleware {
  public use(_request: unknown, response: Response, next: () => void): void {
    response.setHeader('cache-control', 'no-store');
    next();
  }
}
