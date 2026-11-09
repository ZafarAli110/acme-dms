import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  HttpCode,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { map, type Observable } from "rxjs";

/** The metadata @Created() keeps its `locationOf` under: the idempotency interceptor reads it too (ACME-125). */
export const CREATED_LOCATION = Symbol("created-location");

export type LocationOf = (created: unknown) => string;
type HeaderSetter = { setHeader(name: string, value: string): void };

/**
 * A create endpoint: it answers 201 Created with `Location`, where the new record can be read, relative to this
 * service (`/v1/customers/{id}`). The gateway puts its own prefix (`/api/dealership`) back on the way out.
 *
 *   @Post() @Created((customer: CustomerResponseDto) => `/v1/customers/${customer.id}`)
 */
export function Created<TCreated>(locationOf: (created: TCreated) => string) {
  return applyDecorators(
    HttpCode(HttpStatus.CREATED),
    SetMetadata(CREATED_LOCATION, locationOf),
    UseInterceptors(CreatedInterceptor),
  );
}

/** Sets the Location that @Created() names, from the record the handler returned. */
@Injectable()
export class CreatedInterceptor implements NestInterceptor {
  private readonly _reflector: Reflector;

  public constructor(reflector: Reflector) {
    this._reflector = reflector;
  }

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const locationOf = this._reflector.get<LocationOf | undefined>(CREATED_LOCATION, context.getHandler());
    const response = context.switchToHttp().getResponse<HeaderSetter>();
    return next.handle().pipe(
      map((created: unknown) => {
        if (locationOf) {
          response.setHeader("location", locationOf(created));
        }
        return created;
      }),
    );
  }
}
