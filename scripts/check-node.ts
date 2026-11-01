// Stops `bun run dev` and the gates before they start on the wrong Node. The services run on the `node` your terminal
// finds, so another major version (Node 24, say) would start, then fail in ways that are hard to trace. Any Node 26
// will do. The version is .nvmrc's: the one place it is set (CI reads it too).
//
//   bun scripts/check-node.ts

const required = (await Bun.file(new URL('../.nvmrc', import.meta.url)).text()).trim().replace(/^v/, '');

function parse(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10));
}

/** True when `actual` has the same major version and is the same or newer (`26` means any Node 26). */
function satisfies(actual: string, minimum: string): boolean {
  const [major = 0, minor = 0, patch = 0] = parse(actual);
  const [wantMajor = 0, wantMinor = 0, wantPatch = 0] = parse(minimum);
  if (major !== wantMajor) {
    return false;
  }
  if (minor !== wantMinor) {
    return minor > wantMinor;
  }
  return patch >= wantPatch;
}

let actual = '';
try {
  actual = Bun.spawnSync(['node', '--version']).stdout.toString().trim();
} catch {
  actual = '';
}

if (!actual || !satisfies(actual, required)) {
  console.error(
    [
      '',
      `Acme DMS needs Node ${required}; this terminal has ${actual || 'no node'}.`,
      '',
      'Install it and use it here, then run the command again:',
      `  fnm install ${required} && fnm use ${required}      (fnm, from ./setup.sh or .\\setup.ps1; macOS and Windows)`,
      `  nvm install ${required} && nvm use ${required}      (nvm)`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}
