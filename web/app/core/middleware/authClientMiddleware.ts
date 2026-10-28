import {type MiddlewareFunction, redirect} from 'react-router';
import {AUTH_KERNEL_CONTEXT, LOCATION_KERNEL_CONTEXT, RESOLVED_LOCATION_CONTEXT} from './routerContext';

/**
 * Client middleware that runs before every protected route: waits for the signed-in user and the selected location, or sends the browser to
 * the sign-in page. Loaders and actions then read `context.get(RESOLVED_LOCATION_CONTEXT)`; they never read React
 * state or session storage themselves.
 */
export const authClientMiddleware: MiddlewareFunction = async ({context}, next) => {
  const auth = await context.get(AUTH_KERNEL_CONTEXT).waitForResolvedAuthAsync();
  if (auth.status !== 'signed-in') {
    throw redirect('/sign-in');
  }
  const location = await context.get(LOCATION_KERNEL_CONTEXT).waitForResolvedLocationAsync();
  if (location.status !== 'ready' || location.current === null) {
    throw redirect('/sign-in');
  }
  context.set(RESOLVED_LOCATION_CONTEXT, {
    locationId: location.current.id,
    permissions: location.current.permissions,
  });
  return next();
};
