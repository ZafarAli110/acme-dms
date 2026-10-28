import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // The same Temporal the service runs with (src/service/main.ts), whatever Node runs the tests.
    setupFiles: ['temporal-polyfill/global'],
    // One Postgres container per run, with a migrated template database the integration tests clone.
    globalSetup: ['src/persistence/__test__/postgres/global-setup.ts'],
  },
});
