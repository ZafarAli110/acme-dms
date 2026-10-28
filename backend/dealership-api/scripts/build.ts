import {cp} from 'node:fs/promises';

// Bundles our own code (including `#layer/...` subpath imports) and leaves npm packages as runtime imports for Node.
const watch = process.argv.includes('--watch');

async function buildAsync(): Promise<boolean> {
  const result = await Bun.build({
    entrypoints: ['src/service/main.ts', 'src/service/observability/telemetry.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'esm',
    sourcemap: 'linked',
    plugins: [
      {
        name: 'npm-packages-external',
        setup(builder) {
          // Bare specifiers (`@nestjs/core`, `rxjs`, `node:http`) stay external; `#...` and relative paths are bundled.
          builder.onResolve({filter: /^[^.#/]/}, (args) =>
            args.kind === 'entry-point-build' || args.kind === 'entry-point-run' || args.importer === ''
              ? undefined
              : {path: args.path, external: true},
          );
        },
      },
    ],
  });
  // The SQL migrations travel with the bundle: the service applies them at startup from dist/migrations.
  await cp('src/persistence/migrations/drizzle', 'dist/migrations', {recursive: true});
  for (const log of result.logs) {
    console.error(log);
  }
  console.log(result.success ? `built ${result.outputs.length} files` : 'build failed');
  return result.success;
}

const ok = await buildAsync();
if (watch) {
  const {watch: watchFiles} = await import('node:fs');
  let timer: ReturnType<typeof setTimeout> | undefined;
  watchFiles('src', {recursive: true}, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void buildAsync(), 100);
  });
} else if (!ok) {
  process.exit(1);
}
