import {QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {queryClient} from './queryClient';

/** Gives every page the one TanStack Query cache, the same one loaders and actions use. */
export function QueryProvider({children}: {children: ReactNode}) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
