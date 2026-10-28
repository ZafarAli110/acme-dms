// Temporal for browsers that do not have it yet; a native Temporal is left as it is.
import 'temporal-polyfill/global';
import type {MetaFunction} from 'react-router';
import {Outlet} from 'react-router';
import './i18n';

export {RootErrorBoundary as ErrorBoundary} from './RootErrorBoundary';
export {RootHydrateFallback as HydrateFallback} from './RootHydrateFallback';
export {RootLayout as Layout} from './RootLayout';

export const meta: MetaFunction = () => [{title: 'Acme DMS'}];

export default function Root() {
  return <Outlet />;
}
