// Regenerates the typed document-api client from document-api's OpenAPI document.
// Run while `bun run dev` is up:  bun run generate:clients
// Commit both files: the JSON is the contract dealership-api was built against.
const source = process.env['DOCUMENT_API_URL'] ?? 'http://localhost:5280';
const target = 'src/rest-clients/document-api';

const response = await fetch(`${source}/openapi/v1.json`);
if (!response.ok) {
  console.error(`Could not read ${source}/openapi/v1.json (${response.status}). Is document-api running?`);
  process.exit(1);
}
await Bun.write(`${target}/document-api.openapi.json`, `${JSON.stringify(await response.json(), null, 2)}\n`);

// openapi-typescript needs the classic TypeScript compiler API, which TypeScript 7 no longer ships. It is deliberately
// not a dependency: bunx runs it from Bun's global cache with its own TypeScript 5, so the repo stays on TypeScript 7.
const steps = [
  [
    'bunx',
    'openapi-typescript@7.13.0',
    `${target}/document-api.openapi.json`,
    '-o',
    `${target}/document-api.schema.d.ts`,
  ],
  ['bun', 'fmt', `${target}/document-api.schema.d.ts`],
];
for (const step of steps) {
  const result = Bun.spawnSync(step, {stdout: 'inherit', stderr: 'inherit'});
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}
