// Puts the running system back to the known starting state: rebuilds the dealership database from its migrations (so
// a table or migration an agent added in an earlier run is gone too), deletes the documents, empties every queue, puts
// every demo user back on their own locations (undoing the Locations page), then runs the seed. Dealers, locations and
// users are kept.
//
//   bun run reset
import {SQL} from 'bun';
import {resourceUrl} from './running-system';

const DEV_USER = 'acme';
const DEV_PASSWORD = 'acme';

const postgres = new URL(resourceUrl('postgres', 'tcp').replace('tcp://', 'http://'));
async function truncateAsync(database: string, tables: string[]): Promise<void> {
  const sql = new SQL(`postgres://${DEV_USER}:${DEV_PASSWORD}@${postgres.hostname}:${postgres.port}/${database}`);
  await sql.unsafe(`TRUNCATE ${tables.join(', ')} CASCADE`);
  await sql.close();
  console.log(`${database}: emptied ${tables.join(', ')}`);
}
// The dealership database is rebuilt, not emptied: its schema is dropped and the migrations of this branch run again.
// Everything in it is sample data the seed restores, and only a rebuild also removes what an agent's run left behind
// (a vehicles table, an applied migration this branch does not have), so the next run starts where attendees do.
async function rebuildDealershipAsync(): Promise<void> {
  const url = `postgres://${DEV_USER}:${DEV_PASSWORD}@${postgres.hostname}:${postgres.port}/dealership`;
  const sql = new SQL(url);
  await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await sql.close();
  console.log('dealership: dropped every table, rebuilding from the migrations');
  const migrate = Bun.spawnSync(['bun', 'run', 'db:migrate'], {
    cwd: 'backend/dealership-api',
    env: {...process.env, DATABASE_URL: url},
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (migrate.exitCode !== 0) {
    process.exit(migrate.exitCode);
  }
}
await rebuildDealershipAsync();
await truncateAsync('documents', ['outbox_messages', 'document_contents', 'documents']);

const rabbitmq = resourceUrl('rabbitmq', 'management');
const authorization = `Basic ${btoa(`${DEV_USER}:${DEV_PASSWORD}`)}`;
const queues = (await (await fetch(`${rabbitmq}/api/queues`, {headers: {authorization}})).json()) as {
  name: string;
  vhost: string;
}[];
for (const queue of queues) {
  await fetch(`${rabbitmq}/api/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}/contents`, {
    method: 'DELETE',
    headers: {authorization},
  });
}
console.log(`rabbitmq: purged ${queues.map((q) => q.name).join(', ') || 'no queues'}`);

// identity-api's development-only endpoint: it has no database of ours to truncate, the demo users' rows are its own.
const identityReset = await fetch(`${resourceUrl('gateway-api', 'http')}/api/identity/v1/dev/demo-users/reset`, {
  method: 'POST',
});
if (!identityReset.ok) {
  throw new Error(`identity: resetting the demo users failed: ${identityReset.status} ${await identityReset.text()}`);
}
console.log('identity: demo users back on their own locations');

const seed = Bun.spawnSync(['bun', 'scripts/seed.ts'], {stdout: 'inherit', stderr: 'inherit'});
process.exit(seed.exitCode);
