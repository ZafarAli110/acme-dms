import {type CallHandler, type ExecutionContext, Injectable, type NestInterceptor} from '@nestjs/common';
import {PATH_METADATA} from '@nestjs/common/constants.js';
import {trace} from '@opentelemetry/api';
import type {Observable} from 'rxjs';

/**
 * Names the active HTTP server span after the matched Nest route (e.g. `GET /v1/parts/:id`).
 * Generic HTTP instrumentation only sees the raw URL, so without this every span is just `GET`.
 */
@Injectable()
export class TraceRouteInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const span = trace.getActiveSpan();
    if (span && context.getType() === 'http') {
      const method = context.switchToHttp().getRequest<{method: string}>().method;
      const route = this.routeOf(context);
      span.setAttribute('http.route', route);
      span.updateName(`${method} ${route}`);
    }
    return next.handle();
  }

  private routeOf(context: ExecutionContext): string {
    const segments = [
      Reflect.getMetadata(PATH_METADATA, context.getClass()) as string | undefined,
      Reflect.getMetadata(PATH_METADATA, context.getHandler()) as string | undefined,
    ];
    const path = segments.filter((segment) => segment && segment !== '/').join('/');
    return `/${path}`.replace(/\/+/g, '/');
  }
}
