import {AppLoading} from './components/AppLoading';

/** Shown while the router resolves the signed-in user and location on first load. */
export function RootHydrateFallback() {
  return <AppLoading />;
}
