// Run by `bun install` (postinstall): points git at the repository's own hooks in .githooks, so every clone gets the
// pre-commit check without a separate step. Does nothing outside a git checkout.
const inGit = Bun.spawnSync(['git', 'rev-parse', '--git-dir'], {stderr: 'ignore'}).exitCode === 0;
if (inGit) {
  Bun.spawnSync(['git', 'config', 'core.hooksPath', '.githooks']);
}
