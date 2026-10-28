import '@fontsource-variable/inter';
import CssBaseline from '@mui/material/CssBaseline';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import {ThemeProvider} from '@mui/material/styles';
import type {ReactNode} from 'react';
import {Links, Meta, Scripts, ScrollRestoration} from 'react-router';
import {LocationChangeGuardProvider} from './core/contexts/location/LocationChangeGuardContext';
import {QueryProvider} from './core/queries/QueryProvider';
import {appTheme} from './theme';

/** The HTML document and the providers every page needs. */
export function RootLayout({children}: {children: ReactNode}) {
  return (
    // InitColorSchemeScript sets the colour scheme on <html> before React hydrates, so the first paint is right.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <InitColorSchemeScript attribute="class" defaultMode="system" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider theme={appTheme} defaultMode="system" noSsr>
          <CssBaseline enableColorScheme />
          <QueryProvider>
            <LocationChangeGuardProvider>{children}</LocationChangeGuardProvider>
          </QueryProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
