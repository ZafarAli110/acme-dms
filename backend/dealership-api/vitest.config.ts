import {readFileSync} from 'node:fs';
import {defineConfig} from 'vitest/config';

const {version} = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {version: string};

export default defineConfig({
  // The product version, as scripts/build.ts writes it into the bundle.
  define: {APP_VERSION: JSON.stringify(version)},
  test: {
    // The same Temporal the service runs with (src/service/main.ts), whatever Node runs the tests.
    setupFiles: ['temporal-polyfill/global'],
    // Exports get a folder of their own: the export runner empties its folder when it starts, and must never empty the
    // one a running dealership-api is using.
    env: {EXPORT_DIR: `${process.env['TMPDIR'] ?? '/tmp'}/acme-dealership-exports-test`},
    // One Postgres container per run, with a migrated template database the integration tests clone.
    globalSetup: ['src/test-setup/postgres/global-setup.ts'],
  },
});
