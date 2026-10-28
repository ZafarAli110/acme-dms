// Dev loop: Bun rebuilds the bundle on change, Node 26 restarts on the new bundle.
// The first build must succeed before Node starts, so a broken build can never leave an old bundle running.
const firstBuild = Bun.spawnSync(['bun', 'run', 'build'], {stdout: 'inherit', stderr: 'inherit'});
if (firstBuild.exitCode !== 0) {
  console.error('dealership-api: the build failed, not starting. Fix the error above and restart the resource.');
  process.exit(1);
}

const build = Bun.spawn(['bun', 'run', 'build', '--watch'], {stdout: 'inherit', stderr: 'inherit'});
const run = Bun.spawn(
  ['node', '--enable-source-maps', '--import', './dist/observability/telemetry.js', '--watch', 'dist/main.js'],
  {
    stdout: 'inherit',
    stderr: 'inherit',
  },
);

const stop = (exitCode: number) => {
  build.kill();
  run.kill();
  process.exit(exitCode);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
// If either half dies, stop the resource so Aspire shows it as failed instead of serving stale code.
const [which, exitCode] = await Promise.race([
  build.exited.then((code) => ['build watcher', code] as const),
  run.exited.then((code) => ['node', code] as const),
]);
console.error(`dealership-api: ${which} exited (${exitCode}); stopping.`);
stop(exitCode || 1);
