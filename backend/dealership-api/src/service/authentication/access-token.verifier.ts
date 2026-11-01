import {Inject, Injectable} from '@nestjs/common';
import {createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify} from 'jose';
import type {AccessTokenClaims} from './access-token-claims';
import {requireSetting, SETTINGS, type Settings} from '#settings/settings';
import {TOKEN_AUDIENCE, TOKEN_ISSUER} from './token-settings';

/**
 * Verifies identity-api tokens against the keys published in its OpenID discovery document.
 * identity-api's address comes from the settings (`services__identity-api__http__0`).
 */
@Injectable()
export class AccessTokenVerifier {
  private readonly _identityApiUrl: string;
  private _keys: Promise<JWTVerifyGetKey> | null = null;

  public constructor(@Inject(SETTINGS) settings: Settings) {
    this._identityApiUrl = requireSetting(settings.identityApiUrl, 'services__identity-api__http__0');
  }

  public async verifyAsync(token: string): Promise<AccessTokenClaims> {
    const {payload} = await jwtVerify(token, await this.keysAsync(), {issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE});
    return payload as unknown as AccessTokenClaims;
  }

  private keysAsync(): Promise<JWTVerifyGetKey> {
    this._keys ??= this.discoverKeysAsync().catch((error: unknown) => {
      this._keys = null;
      throw error;
    });
    return this._keys;
  }

  private async discoverKeysAsync(): Promise<JWTVerifyGetKey> {
    const response = await fetch(`${this._identityApiUrl}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw new Error(`identity-api discovery returned ${response.status}`);
    }
    const {jwks_uri: jwksUri} = (await response.json()) as {jwks_uri: string};
    return createRemoteJWKSet(new URL(jwksUri));
  }
}
