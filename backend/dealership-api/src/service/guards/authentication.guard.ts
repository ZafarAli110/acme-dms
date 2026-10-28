import {type CanActivate, type ExecutionContext, Injectable, UnauthorizedException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import type {AccessTokenClaims} from '../authentication/access-token-claims';
import {AccessTokenVerifier} from '../authentication/access-token.verifier';
import {IS_PUBLIC} from '../authentication/public.decorator';

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

  public constructor(reflector: Reflector, accessTokenVerifier: AccessTokenVerifier) {
    this._reflector = reflector;
    this._accessTokenVerifier = accessTokenVerifier;
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this._reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) {
      throw new UnauthorizedException('A bearer access token is required.');
    }

    try {
      request.accessToken = await this._accessTokenVerifier.verifyAsync(token);
      request.rawAccessToken = token;
    } catch {
      throw new UnauthorizedException('The access token is invalid or has expired.');
    }
    return true;
  }
}
