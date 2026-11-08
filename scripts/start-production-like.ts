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
// For `bun run load-test`: bun run start:prod --load-test lifts the limits per address (sign-ins a minute, requests a
// second), which a load test from one machine trips at once; the share per sign-in stays (see AppHost.cs).
// A change to the code needs a restart: nothing here watches files.
const options = process.argv.slice(2);
const unknown = options.filter((option) => option !== "--load-test");
if (unknown.length > 0) {
  console.error(`Unknown option ${unknown.join(" ")}. Usage: bun run start:prod [--load-test]`);
  process.exit(1);
}
const loadTest = options.includes("--load-test");
if (loadTest) {
  console.warn(
    "Load test: the limits per address are off (sign-ins a minute, requests a second). Measure with it; never deploy it.",
  );
}

// `aspire run` builds the AppHost in Release (Configuration below) and then starts its Debug build (Aspire CLI 13.6.4):
// build that one first, so the AppHost that runs is the one in the code. The services' own Release builds come from
// the Release build of the AppHost (ReleaseBuild in AppHost.cs).
const debugAppHost = Bun.spawnSync(["dotnet", "build", "apphost/Acme.AppHost", "-c", "Debug", "--nologo", "-v", "q"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (debugAppHost.exitCode !== 0) {
  console.error("Building the AppHost failed; see above.");
  process.exit(1);
}

const appHost = Bun.spawn(["aspire", "run"], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    ACME_PRODUCTION_LIKE: "1",
    ...(loadTest ? { ACME_LOAD_TEST: "1" } : {}),
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
