// PreToolUse hook for Edit and Write: refuses changes the team never makes by hand, before they happen.
//   - secrets: .env files (.env.example is fine)
//   - a migration that is already committed: it may have run somewhere, so add a new one instead
// Exit code 2 blocks the tool call; what is written to stderr is shown to Claude as the reason.
import {relative} from 'node:path';

interface HookInput {
  cwd: string;
  tool_input: {file_path?: string};
}

const MIGRATION_FOLDERS = [/\/persistence\/migrations\//, /\.Persistence\/Migrations\//];

const input = JSON.parse(await Bun.stdin.text()) as HookInput;
const filePath = input.tool_input.file_path ?? '';
const path = relative(input.cwd, filePath);

if (/(^|\/)\.env(\.|$)/.test(path) && !path.endsWith('.env.example')) {
  block(`${path} holds secrets. Do not read or change .env files; use .env.example for documentation.`);
}
if (MIGRATION_FOLDERS.some((folder) => folder.test(`/${path}`)) && (await isCommittedAsync(path))) {
  block(
    `${path} is a committed migration and may already have run. Never edit it: add a new migration ` +
      '(docs/standards/database.md, "Migrations").',
  );
}

async function isCommittedAsync(file: string): Promise<boolean> {
  const git = Bun.spawn(['git', 'ls-files', '--error-unmatch', file], {
    cwd: input.cwd,
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return (await git.exited) === 0;
}

function block(reason: string): never {
  console.error(reason);
  process.exit(2);
}
