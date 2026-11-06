import { defineConfig } from "vitest/config";

// Unit tests for the web app's pure logic (formatters, mappers, schemas): plain functions, in `__test__/` next to them.
// Screens are tested end to end with Playwright (`e2e/`), never as components.
export default defineConfig({
  test: {
    include: ["app/**/__test__/*.test.ts"],
    // The same Temporal the app runs with (app/root.tsx).
    setupFiles: ["temporal-polyfill/global"],
  },
});
