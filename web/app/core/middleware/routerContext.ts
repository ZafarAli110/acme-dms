import {createContext, RouterContextProvider} from 'react-router';
import {type AuthKernel, authKernel} from '../kernel/authKernel';
import {type LocationKernel, locationKernel} from '../kernel/locationKernel';

/** What every protected loader and action can rely on: set by `authMiddleware` before they run. */
export interface ResolvedLocation {
  locationId: string;
  permissions: string[];
}

export const AUTH_KERNEL_CONTEXT = createContext<AuthKernel>();
export const LOCATION_KERNEL_CONTEXT = createContext<LocationKernel>();
export const RESOLVED_LOCATION_CONTEXT = createContext<ResolvedLocation | null>(null);

/** The router's context, given to `createBrowserRouter({getContext})`: the kernels, for middleware and loaders. */
export function createRouterContext(): RouterContextProvider {
  return new RouterContextProvider(
    new Map<Parameters<RouterContextProvider['get']>[0], unknown>([
      [AUTH_KERNEL_CONTEXT, authKernel],
      [LOCATION_KERNEL_CONTEXT, locationKernel],
    ]),
  );
}
