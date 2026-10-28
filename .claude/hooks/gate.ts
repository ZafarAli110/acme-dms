// Stop hook: Claude may not say it is finished while the fast gate fails. Runs `bun run gate:fast` (format, lint,
// typecheck and tests of the changed projects) when code has changed, and sends Claude back to work with the output of
// the failed tasks.
// If Claude is already continuing because of this hook and the gate still fails, it is allowed to stop, and the person
// is told: a hook that never lets go is a loop, not a gate.
interface HookInput {
  stop_hook_active: boolean;
}

const LINES_PER_TASK = 30;
const PROJECT = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();

const input = JSON.parse(await Bun.stdin.text()) as HookInput;

if (await hasCodeChangesAsync()) {
  const gate = Bun.spawn(['bun', 'run', 'gate:fast', '--output-style=static'], {
    cwd: PROJECT,
    env: {...process.env, NO_COLOR: '1', FORCE_COLOR: '0'},
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(gate.stdout).text(),
    new Response(gate.stderr).text(),
    gate.exited,
  ]);
  if (exitCode !== 0) {
    if (input.stop_hook_active) {
      console.log(JSON.stringify({systemMessage: 'bun run gate:fast still fails. The change is not done.'}));
      process.exit(0);
    }
    console.error(
      `bun run gate:fast fails, so the change is not done. Fix it, then finish.\n\n${failedTasks(`${stdout}\n${stderr}`)}`,
    );
    process.exit(2);
  }
}

async function hasCodeChangesAsync(): Promise<boolean> {
  const git = Bun.spawn(['git', 'status', '--porcelain'], {cwd: PROJECT, stdout: 'pipe'});
  const changed = (await new Response(git.stdout).text())
    .split('\n')
    .map((line) => line.slice(3))
    .filter((path) => path !== '' && !path.startsWith('docs/') && !path.startsWith('.claude/'));
  return changed.length > 0;
}

// Nx prints every task's output under "> nx run <project>:<target>" and lists the failed ones at the end. Only the
// failed tasks' output is useful to Claude; the rest is noise in its context.
function failedTasks(output: string): string {
  const failed = [...output.matchAll(/^- (\S+:\S+)$/gm)].map((match) => match[1]);
  const sections = output.split(/^> nx run /m);
  const shown = failed.map((task) => {
    const section =
      (sections.find((candidate) => candidate.startsWith(task ?? '')) ?? '').split(/^\s*Run duration:/m)[0] ?? '';
    return `> ${task}\n${section.trim().split('\n').slice(-LINES_PER_TASK).join('\n')}`;
  });
  return shown.length > 0 ? shown.join('\n\n') : output.trim().split('\n').slice(-LINES_PER_TASK).join('\n');
}
