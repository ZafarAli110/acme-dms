// Stops `bun run dev` and the gates before they start on the wrong Node. The services run on the `node` your terminal
// finds, so an older one (Node 24, say) would start, then fail in ways that are hard to trace. Node 26 or later will
// do. The version is .nvmrc's: the one place it is set (CI and fnm read it too).
//
//   bun scripts/check-node.ts

const required = (await Bun.file(new URL("../.nvmrc", import.meta.url)).text()).trim().replace(/^v/, "");

function parse(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));
}

/** True when `actual` is `minimum` or newer (`26` means Node 26 or any later version). */
function satisfies(actual: string, minimum: string): boolean {
  const [major = 0, minor = 0, patch = 0] = parse(actual);
  const [wantMajor = 0, wantMinor = 0, wantPatch = 0] = parse(minimum);
  if (major !== wantMajor) {
    return major > wantMajor;
  }
  if (minor !== wantMinor) {
    return minor > wantMinor;
  }
  return patch >= wantPatch;
}

let actual = "";
try {
  actual = Bun.spawnSync(["node", "--version"]).stdout.toString().trim();
} catch {
  actual = "";
}

if (!actual || !satisfies(actual, required)) {
  console.error(
    [
      "",
      `Acme DMS needs Node ${required} or later; this terminal has ${actual || "no node"}.`,
      "",
      "Install it and use it here, then run the command again:",
      `  fnm install ${required} && fnm use ${required}      (fnm, from ./setup.sh or .\\setup.ps1; macOS and Windows)`,
      `  nvm install ${required} && nvm use ${required}      (nvm)`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}
