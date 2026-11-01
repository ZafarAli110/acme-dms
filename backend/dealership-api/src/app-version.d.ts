/**
 * The product version, "26.11.0": the root package.json's `version`, the one place it is set for every service. The
 * build (scripts/build.ts) and the tests (vitest.config.ts) write it into the code; nothing reads a file at runtime.
 */
declare const APP_VERSION: string;
