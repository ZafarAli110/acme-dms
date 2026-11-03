// Dev loop: Bun rebuilds the bundle on change, Node 26 restarts on the new bundle.
// The first build must succeed before Node starts, so a broken build can never leave an old bundle running.
//
//   bun scripts/dev.ts          the API (dist/main.js): builds, watches the sources, runs and restarts the API
//   bun scripts/dev.ts worker   the export worker (dist/worker.js): runs and restarts on the API's builds
//
// The API's loop is the only one that builds: both bundles come out of one build, and two watchers writing the same
// dist/ would restart each other's process. The worker's loop builds once only if there is no bundle yet (started on
// its own), then lets node --watch pick up the API loop's rebuilds.
const worker = process.argv[2] === "worker";
const name = worker ? "export worker" : "dealership-api";
const entry = worker ? "dist/worker.js" : "dist/main.js";

if (!worker || !(await Bun.file(entry).exists())) {
  const firstBuild = Bun.spawnSync(["bun", "run", "build"], { stdout: "inherit", stderr: "inherit" });
  if (firstBuild.exitCode !== 0) {
    console.error(`${name}: the build failed, not starting. Fix the error above and restart the resource.`);
    process.exit(1);
  }
}

const build = worker ? null : Bun.spawn(["bun", "run", "build", "--watch"], { stdout: "inherit", stderr: "inherit" });
const run = Bun.spawn(
  // --env-file-if-exists: Node reads .env itself (no dotenv); a variable already set, by Aspire or your shell, wins.
  [
    "node",
    "--env-file-if-exists=.env",
    "--enable-source-maps",
    "--import",
    "./dist/observability/telemetry.js",
    "--watch",
    entry,
  ],
  {
    stdout: "inherit",
    stderr: "inherit",
  },
);

const stop = (exitCode: number) => {
  build?.kill();
  run.kill();
  process.exit(exitCode);
};
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
// If either half dies, stop the resource so Aspire shows it as failed instead of serving stale code.
const [which, exitCode] = await Promise.race([
  ...(build ? [build.exited.then((code) => ["build watcher", code] as const)] : []),
  run.exited.then((code) => ["node", code] as const),
]);
console.error(`${name}: ${which} exited (${exitCode}); stopping.`);
stop(exitCode || 1);
