import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  // The product version, as scripts/build.ts writes it into the bundle.
  define: { APP_VERSION: JSON.stringify(version) },
  test: {
    // Only with --coverage (bun run coverage at the repository root): which lines the tests ran, from src/ only.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__test__/**", "src/test-setup/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "cobertura", "html"],
      reportsDirectory: "coverage",
    },
    // The same Temporal the service runs with (src/service/main.ts), whatever Node runs the tests.
    setupFiles: ["temporal-polyfill/global"],
    // One Postgres container per run, with a migrated template database the integration tests clone.
    globalSetup: ["src/test-setup/postgres/global-setup.ts"],
  },
});
