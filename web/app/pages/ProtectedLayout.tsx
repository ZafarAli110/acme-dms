import {Outlet} from 'react-router';
import {authClientMiddleware} from '../core/middleware/authClientMiddleware';

/** Every page behind sign-in sits under this route; the middleware runs before their loaders and actions. */
export const clientMiddleware = [authClientMiddleware];

export default function ProtectedLayout() {
  return <Outlet />;
}
