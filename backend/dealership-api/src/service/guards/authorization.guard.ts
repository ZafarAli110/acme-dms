import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {AccessTokenClaims} from '../authentication/access-token-claims';
import {REQUIRED_PERMISSION} from '../authorization/require-permission.decorator';

export const LOCATION_HEADER = 'x-location-id';

type AuthorizedRequest = {
  headers: Record<string, string | string[] | undefined>;
  accessToken?: AccessTokenClaims;
  rawAccessToken?: string;
  userContext?: UserContext;
};

/**
 * Resolves the user's location from `x-location-id`, refuses locations the token does not grant, and enforces
 * `@RequirePermission`. Runs after AuthenticationGuard; public endpoints have no access token and are skipped.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly _reflector: Reflector;

  public constructor(reflector: Reflector) {
    this._reflector = reflector;
  }

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const token = request.accessToken;
    if (!token) {
      return true;
    }

    const header = request.headers[LOCATION_HEADER];
    const locationId = typeof header === 'string' && header.length > 0 ? header : null;
    const location = locationId ? token.locations.find((candidate) => candidate.id === locationId) : undefined;
    if (locationId && !location) {
      throw new ForbiddenException(`You do not work at location ${locationId}.`);
    }

    const userContext: UserContext = {
      userId: token.sub,
      locationId,
      permissions: location?.permissions ?? [],
      accessToken: request.rawAccessToken ?? '',
    };
    request.userContext = userContext;

    const required = this._reflector.get<string | undefined>(REQUIRED_PERMISSION, context.getHandler());
    if (!required) {
      return true;
    }
    if (!locationId) {
      throw new BadRequestException(`The ${LOCATION_HEADER} header is required for this endpoint.`);
    }
    if (!userContext.permissions.includes(required)) {
      throw new ForbiddenException(`You do not have the '${required}' permission at this location.`);
    }
    return true;
  }
}
