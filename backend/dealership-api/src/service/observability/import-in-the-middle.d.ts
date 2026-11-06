// import-in-the-middle ships `register-hooks.d.ts` next to `register-hooks.mjs`; TypeScript looks for `.d.mts` beside an
// `.mjs` file, so it never finds them. This is the one function telemetry.ts uses, as the package declares it.
declare module "import-in-the-middle/register-hooks.mjs" {
  /** Registers the in-thread loader hook (Node 22.22.3, 24.11.1, 25.1.0, 26.0.0 or later). */
  export function register(options?: { include?: (string | RegExp)[]; exclude?: (string | RegExp)[] }): void;
}
