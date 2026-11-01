// The git pre-commit hook (.githooks/pre-commit, switched on by the setup script or `bun run hooks`): checks only the files being committed, in a second or two, so a
// formatting slip or a broken architecture rule (a controller importing persistence) stops at the commit, not in CI.
// The full checks still run in `bun run gate:fast` and in CI.

const LINTABLE = /\.(ts|tsx|js|mjs)$/;
const FORMATTABLE = /\.(ts|tsx|js|mjs|json|md|css)$/;

function run(command: string[], cwd = '.'): boolean {
  const result = Bun.spawnSync(command, {cwd, stdout: 'inherit', stderr: 'inherit'});
  return result.exitCode === 0;
}

const staged = Bun.spawnSync(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  .stdout.toString()
  .split('\0')
  .filter((file) => file.length > 0);

let ok = true;

// Formatting: bun fmt, the same as `bun run format`.
const formattable = staged.filter((file) => FORMATTABLE.test(file));
if (formattable.length > 0) {
  ok = run(['bun', 'fmt', '--check', ...formattable]) && ok;
}

// Lint: dealership-api with its own rules (which layer may import which), everything else with the root rules.
const lintable = staged.filter((file) => LINTABLE.test(file));
const dealershipApi = 'backend/dealership-api/';
const apiFiles = lintable
  .filter((file) => file.startsWith(dealershipApi))
  .map((file) => file.slice(dealershipApi.length));
if (apiFiles.length > 0) {
  ok = run(['bunx', 'oxlint', '-c', '.oxlintrc.json', ...apiFiles], dealershipApi) && ok;
}
const otherFiles = lintable.filter((file) => !file.startsWith(dealershipApi));
if (otherFiles.length > 0) {
  ok = run(['bunx', 'oxlint', ...otherFiles]) && ok;
}

// C#: whitespace, per project folder, the same check as each .NET project's `format`.
const DOTNET_PROJECTS = [
  'backend/identity-api/',
  'backend/document-api/',
  'backend/gateway-api/',
  'backend/service-defaults/',
  'apphost/',
];
for (const project of DOTNET_PROJECTS) {
  const files = staged
    .filter((file) => file.endsWith('.cs') && file.startsWith(project))
    .map((file) => file.slice(project.length));
  if (files.length > 0) {
    ok =
      run(['dotnet', 'format', 'whitespace', '.', '--folder', '--verify-no-changes', '--include', ...files], project) &&
      ok;
  }
}

if (!ok) {
  console.error(
    '\npre-commit: fix the problems above (`bun run format` fixes formatting), stage the files, commit again.',
  );
  process.exit(1);
}
