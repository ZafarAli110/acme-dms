// `bun run start:prod`: the whole system run the way production runs it, to measure it (`bun run load-test`) or check
// a build in a browser. Not production: still Development settings (the demo users, the dev credentials, plain HTTP),
// so everything else works as in `bun run dev`. What changes is how each part runs:
//
//   dealership-api, its copies and the export worker   the bundle built once, run by Node, no watching or rebuilding
//   identity-api, document-api, gateway-api            Release builds (optimised), not Debug
//   web                                                the production build, served as files (scripts/serve-web.ts)
//   logs                                               warnings and errors only: per-request info lines cost time
//
// More copies: DEALERSHIP_API_INSTANCES=4 bun run start:prod (PowerShell: $env:DEALERSHIP_API_INSTANCES=4 first).
// A change to the code needs a restart: nothing here watches files.
const appHost = Bun.spawn(["aspire", "run"], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    ACME_PRODUCTION_LIKE: "1",
    // MSBuild reads it like -c Release, for the AppHost and the projects it builds.
    Configuration: "Release",
  },
});
const stopAppHost = (): void => {
  appHost.kill("SIGINT");
};
process.on("SIGINT", stopAppHost);
process.on("SIGTERM", stopAppHost);
void appHost.exited.then((exitCode) => process.exit(exitCode));
