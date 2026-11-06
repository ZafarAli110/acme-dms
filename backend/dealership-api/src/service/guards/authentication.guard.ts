import { localized } from "#i18n/messages";
import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AccessTokenClaims } from "../authentication/access-token-claims";
import { AccessTokenVerifier } from "../authentication/access-token.verifier";
import { RevokedSessionsFeed } from "../authentication/revoked-sessions.feed";
import { IS_PUBLIC } from "../authentication/public.decorator";

type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  accessToken?: AccessTokenClaims;
  rawAccessToken?: string;
};

/** Every endpoint requires a valid identity-api access token unless it is marked `@Public()`. */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly _reflector: Reflector;
  private readonly _accessTokenVerifier: AccessTokenVerifier;
  private readonly _revokedSessions: RevokedSessionsFeed;

  public constructor(
    reflector: Reflector,
    accessTokenVerifier: AccessTokenVerifier,
    revokedSessions: RevokedSessionsFeed,
  ) {
    this._reflector = reflector;
    this._accessTokenVerifier = accessTokenVerifier;
    this._revokedSessions = revokedSessions;
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this._reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers["authorization"];
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) {
      throw new UnauthorizedException(localized("errors.accessTokenRequired"));
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this._accessTokenVerifier.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(localized("errors.accessTokenInvalid"));
    }
    // Valid and unexpired, but its sign-in may have been ended (signed out): that is refused the same way. Every token
    // identity-api issues has a sign-in id; one without could never be ended, so it is not accepted.
    if (!claims.sid || this._revokedSessions.isEnded(claims.sid)) {
      throw new UnauthorizedException(localized("errors.accessTokenInvalid"));
    }
    request.accessToken = claims;
    request.rawAccessToken = token;
    return true;
  }
}
