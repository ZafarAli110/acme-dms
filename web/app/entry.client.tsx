import {StrictMode, startTransition} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {HydratedRouter} from 'react-router/dom';
import {createRouterContext} from './core/middleware/routerContext';

// The router's context carries the auth and location kernels to client middleware, loaders and actions.
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter getContext={createRouterContext} />
    </StrictMode>,
  );
});
