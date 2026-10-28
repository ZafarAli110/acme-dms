import {defineConfig} from '@playwright/test';
import {webBaseUrl} from './support/base-url';

/**
 * End-to-end tests of the web app against the running system (`bun run dev`). They sign in as the demo users and only
 * ever change records they created themselves (named `e2e-…`), so the seeded data the workshop relies on stays as it
 * is. The installed Chrome is used: nothing to download.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: webBaseUrl(),
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
});
