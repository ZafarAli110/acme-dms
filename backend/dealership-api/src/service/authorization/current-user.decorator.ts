import {createParamDecorator, type ExecutionContext} from '@nestjs/common';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';

/** Injects the signed-in user's context (user, dealer, location, permissions) resolved by AuthorizationGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): UserContext => {
  const userContext = context.switchToHttp().getRequest<{userContext?: UserContext}>().userContext;
  if (!userContext) {
    throw new Error('No user context on the request: @CurrentUser() cannot be used on a @Public() endpoint.');
  }
  return userContext;
});
