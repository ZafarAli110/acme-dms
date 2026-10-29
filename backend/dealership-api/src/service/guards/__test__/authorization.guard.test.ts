import type {ExecutionContext} from '@nestjs/common';
import {BadRequestException, ForbiddenException} from '@nestjs/common';
import type {Reflector} from '@nestjs/core';
import {describe, expect, it} from 'vitest';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {AccessTokenClaims} from '../../authentication/access-token-claims';
import {AuthorizationGuard} from '../authorization.guard';

const RIVERSIDE = '20000000-0000-0000-0000-000000000002';
const NORTHSIDE = '20000000-0000-0000-0000-000000000001';

const bob: AccessTokenClaims = {
  sub: 'bob',
  email: 'bob@northwind.test',
  name: 'Bob Parts Clerk',
  dealer_id: 'northwind',
  dealer_name: 'Northwind Motors',
  locations: [
    {id: RIVERSIDE, code: 'NWM-R', name: 'Riverside', role: 'PartsClerk', permissions: ['parts.read', 'stock.adjust']},
  ],
};

function run(locationId: string | undefined, requiredPermission?: string): UserContext | undefined {
  const reflector = {get: () => requiredPermission} as unknown as Reflector;
  const request: {
    headers: Record<string, string>;
    accessToken: AccessTokenClaims;
    rawAccessToken: string;
    userContext?: UserContext;
  } = {
    headers: locationId ? {'x-location-id': locationId} : {},
    accessToken: bob,
    rawAccessToken: 'raw-token',
  };
  const context = {
    switchToHttp: () => ({getRequest: () => request}),
    getHandler: () => undefined,
  } as unknown as ExecutionContext;

  new AuthorizationGuard(reflector).canActivate(context);
  return request.userContext;
}

describe('AuthorizationGuard', () => {
  it('builds the user context for a location the user works at', () => {
    const userContext = run(RIVERSIDE, 'stock.adjust');

    expect(userContext).toEqual({
      userId: 'bob',
      locationId: RIVERSIDE,
      permissions: ['parts.read', 'stock.adjust'],
      accessToken: 'raw-token',
    });
  });

  it('refuses a location the user does not work at', () => {
    expect(() => run(NORTHSIDE)).toThrow(ForbiddenException);
  });

  it('refuses a permission the user does not hold at the location', () => {
    expect(() => run(RIVERSIDE, 'parts.write')).toThrow(ForbiddenException);
  });

  it('requires a location when the endpoint needs a permission', () => {
    expect(() => run(undefined, 'parts.read')).toThrow(BadRequestException);
  });
});
