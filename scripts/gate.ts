// The fast gate: format, lint, typecheck and test the projects your change touches, and nothing else.
// "Your change" is everything since the branch you started from: its upstream (origin/lab/03-hooks, origin/main), or
// main when the branch has none. Comparing with main instead would check every project on every lab branch, since each
// lab already differs from main.
//
//   bun run gate:fast

const check = Bun.spawnSync(["bun", "scripts/check-node.ts"], { stdout: "inherit", stderr: "inherit" });
if (check.exitCode !== 0) {
  process.exit(check.exitCode);
}

function git(...args: string[]): string | null {
  const result = Bun.spawnSync(["git", ...args], { stderr: "ignore" });
  return result.exitCode === 0 ? result.stdout.toString().trim() : null;
}

const upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
const base = (upstream ? git("merge-base", "HEAD", upstream) : null) ?? "main";
console.log(`gate:fast: checking what changed since ${upstream ?? "main"} (${base.slice(0, 7)}), committed or not`);

const gate = Bun.spawnSync(["bunx", "nx", "affected", `--base=${base}`, "-t", "format", "lint", "typecheck", "test"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, NX_TUI: "false" },
});
process.exit(gate.exitCode);
