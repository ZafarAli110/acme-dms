// PreToolUse hook for Bash: an agent may commit, push and open pull requests on its own, but only on a branch named
// after a ticket (ACME-106), and it never merges.
//   - git commit, git push, gh pr create / comment: only on a ticket branch
//   - git push: never forced, never to main or a lab/ branch
//   - gh pr merge: never; a person merges
// Exit code 2 blocks the tool call; what is written to stderr is shown to Claude as the reason.

interface HookInput {
  cwd: string;
  tool_input: { command?: string };
}

const TICKET_BRANCH = /^ACME-\d+$/;

const input = JSON.parse(await Bun.stdin.text()) as HookInput;
const command = input.tool_input.command ?? "";

if (/\bgh\s+pr\s+merge\b/.test(command)) {
  block("A person merges pull requests. Stop and hand over the pull request link instead.");
}

const pushes = /\bgit\s+push\b/.test(command);
const changesHistory = pushes || /\bgit\s+commit\b/.test(command) || /\bgh\s+pr\s+(create|comment)\b/.test(command);

if (pushes && /(\s--force\b|\s--force-with-lease\b|\s-f\b|\s\+\S)/.test(command)) {
  block("Never force-push. If the remote moved on, stop and report: a person or a stronger model decides.");
}
if (pushes && /\s(main|lab\/\S+)(\s|$)/.test(command)) {
  block("Never push to main or a lab/ branch. Push the ticket branch: git push -u origin <ticket key>.");
}

if (changesHistory) {
  const branch = await currentBranchAsync();
  if (!TICKET_BRANCH.test(branch)) {
    block(
      `You are on '${branch}'. Commits, pushes and pull requests run only on a branch named after a ticket: ` +
        "git switch -c <ticket key> (e.g. ACME-106) first.",
    );
  }
}

async function currentBranchAsync(): Promise<string> {
  const git = Bun.spawn(["git", "branch", "--show-current"], { cwd: input.cwd, stdout: "pipe", stderr: "ignore" });
  const branch = (await new Response(git.stdout).text()).trim();
  await git.exited;
  return branch;
}

function block(reason: string): never {
  console.error(reason);
  process.exit(2);
}
