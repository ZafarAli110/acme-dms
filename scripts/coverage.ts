// Runs every project's tests with coverage and prints one table: how many lines the tests ran, per project.
// Each project also leaves a full report in coverage/ (Cobertura XML; dealership-api also as HTML).
//
//   bun run coverage
//
// dealership-api's tests start Postgres in Docker, so Docker Desktop must be running.

import {join, relative} from 'node:path';
const check = Bun.spawnSync(['bun', 'scripts/check-node.ts'], {stdout: 'inherit', stderr: 'inherit'});
if (check.exitCode !== 0) {
  process.exit(check.exitCode);
}

/** The repository root, as a native path (C:\… on Windows). */
const root = join(import.meta.dir, '..');

interface Project {
  name: string;
  command: string[];
  cwd: string;
  /** Where the Cobertura report lands. */
  report: string;
}

const DOTNET = [
  {name: 'identity-api', folder: 'backend/identity-api', solution: 'Acme.Identity.slnx'},
  {name: 'document-api', folder: 'backend/document-api', solution: 'Acme.Documents.slnx'},
  {name: 'gateway-api', folder: 'backend/gateway-api', solution: 'Acme.Gateway.slnx'},
];

const projects: Project[] = [
  {
    name: 'dealership-api',
    command: ['bunx', 'vitest', 'run', '--coverage'],
    cwd: join(root, 'backend', 'dealership-api'),
    report: join(root, 'backend', 'dealership-api', 'coverage', 'cobertura-coverage.xml'),
  },
  ...DOTNET.map(({name, folder, solution}) => ({
    name,
    command: [
      'dotnet',
      'test',
      '--solution',
      solution,
      '--coverage',
      '--coverage-output-format',
      'cobertura',
      '--coverage-output',
      `${name}.cobertura.xml`,
      '--results-directory',
      join(root, 'coverage', name),
    ],
    cwd: join(root, ...folder.split('/')),
    report: join(root, 'coverage', name, `${name}.cobertura.xml`),
  })),
];

/** Lines the tests ran, from a Cobertura report's root element. */
async function readLinesAsync(report: string): Promise<{covered: number; valid: number} | null> {
  const file = Bun.file(report);
  if (!(await file.exists())) {
    return null;
  }
  const head = (await file.text()).slice(0, 2000);
  const covered = /lines-covered="(\d+)"/.exec(head)?.[1];
  const valid = /lines-valid="(\d+)"/.exec(head)?.[1];
  return covered && valid ? {covered: Number(covered), valid: Number(valid)} : null;
}

let failed = false;
const rows: string[] = [];
for (const project of projects) {
  console.log(`coverage: ${project.name}…`);
  const run = Bun.spawnSync(project.command, {cwd: project.cwd, stdout: 'pipe', stderr: 'pipe'});
  if (run.exitCode !== 0) {
    failed = true;
    console.error(run.stdout.toString(), run.stderr.toString());
    rows.push(`${project.name.padEnd(16)} tests failed`);
    continue;
  }
  const lines = await readLinesAsync(project.report);
  rows.push(
    lines
      ? `${project.name.padEnd(16)} ${((100 * lines.covered) / Math.max(lines.valid, 1)).toFixed(1).padStart(5)}%  ` +
          `${lines.covered} of ${lines.valid} lines   ${relative(root, project.report)}`
      : `${project.name.padEnd(16)} no report at ${relative(root, project.report)}`,
  );
}

console.log(
  [
    '',
    'Project          Lines run',
    ...rows,
    '',
    'dealership-api as HTML: backend/dealership-api/coverage/index.html',
  ].join('\n'),
);
process.exit(failed ? 1 : 0);
