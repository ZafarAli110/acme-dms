// PostToolUse hook for Edit and Write: formats the file Claude just changed, so formatting is never a review comment
// and never fails the gate. C# is left to `dotnet format` in the gate; it is too slow to run on every edit.
interface HookInput {
  tool_input: {file_path?: string};
}

const FORMATTED = /\.(ts|tsx|js|mjs|json|md|css)$/;

const input = JSON.parse(await Bun.stdin.text()) as HookInput;
const filePath = input.tool_input.file_path ?? '';

if (FORMATTED.test(filePath)) {
  const format = Bun.spawn(['bun', 'fmt', filePath], {stdout: 'ignore', stderr: 'pipe'});
  if ((await format.exited) !== 0) {
    // Not a block: the edit already happened. Tell Claude so it can fix the syntax the formatter choked on.
    console.error(`bun fmt could not format ${filePath}:\n${await new Response(format.stderr).text()}`);
    process.exit(2);
  }
}
