import type {RouteConfig} from '@react-router/dev/routes';
import {index, layout, prefix, route} from '@react-router/dev/routes';

// Every page is a route module here: its component is the default export, next to its clientLoader and clientAction.
// Pages in the sidebar are listed in core/config/navigation.tsx.
export default [
  // Public
  route('sign-in', './pages/SignIn.tsx'),
  route('sign-out', './pages/SignOut.tsx'),

  // Protected: ProtectedLayout's clientMiddleware resolves the user and the location before any loader or action runs.
  layout('./pages/ProtectedLayout.tsx', [
    layout('./components/Layout.tsx', [
      index('./pages/Home.tsx'),

      ...prefix('parts', [index('./pages/parts/PartList.tsx'), route(':partId', './pages/parts/PartEdit.tsx')]),

      ...prefix('customers', [
        index('./pages/customers/CustomerList.tsx'),
        route('new', './pages/customers/CustomerCreate.tsx'),
        route(':customerId', './pages/customers/CustomerEdit.tsx'),
      ]),

      route('*', './pages/NotFound.tsx'),
    ]),
  ]),
] satisfies RouteConfig;
