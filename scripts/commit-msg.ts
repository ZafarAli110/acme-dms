// The git commit-msg hook (.githooks/commit-msg, switched on by the setup script or `bun run hooks`): a commit message's
// first line is at most 100 characters, so `git log --oneline` and the pull request list stay readable. The rule is in
// .claude/rules/git-policy.md; this is what makes it hold for people and agents alike.

const MAX = 100;

const file = Bun.argv[2] ?? "";
const message = await Bun.file(file).text();
const subject = message.split("\n").find((line) => line.trim().length > 0 && !line.startsWith("#")) ?? "";

if (subject.length > MAX) {
  console.error(
    `Commit message refused: its first line is ${subject.length} characters; the limit is ${MAX}.\n` +
      `Say what changed in one short line (e.g. "ACME-107: save a new part with its photos in one go").\n` +
      `  ${subject}`,
  );
  process.exit(1);
}
