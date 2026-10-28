import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

// Aspire finds the running AppHost from the repository root.
const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..');

/** The web app's URL: E2E_BASE_URL, or the running Aspire stack's `web` resource. */
export function webBaseUrl(): string {
  const configured = process.env['E2E_BASE_URL'];
  if (configured) {
    return configured;
  }
  let described: {resources?: {displayName: string; urls?: {name: string; url: string}[]}[]} = {};
  try {
    described = JSON.parse(
      execFileSync('aspire', ['describe', 'web', '--format', 'Json', '--nologo'], {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: REPOSITORY_ROOT,
      }),
    ) as typeof described;
  } catch (error) {
    throw new Error('Start the system first (`bun run dev`), or set E2E_BASE_URL to the web app.', {cause: error});
  }
  const url = described.resources?.find((resource) => resource.displayName === 'web')?.urls?.[0]?.url;
  if (!url) {
    throw new Error('Aspire has no running `web` resource. Start the system first (`bun run dev`).');
  }
  return url;
}
