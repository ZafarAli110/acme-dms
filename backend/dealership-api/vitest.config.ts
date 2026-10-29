import {defineConfig} from 'vitest/config';

export default defineConfig({
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
