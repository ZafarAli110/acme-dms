// Puts the running system back to the known starting state: deletes all business data (parts, bins, stock, photos, customers,
// documents), empties every queue, then runs the seed. Dealers, locations and users are kept.
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
// dealership-api moved from TypeORM to Drizzle with a fresh baseline: a database still holding TypeORM's history is
// recreated empty and migrated, then seeded like any other. (Its business data is test data the seed restores.)
async function migrateDealershipAsync(): Promise<void> {
  const url = `postgres://${DEV_USER}:${DEV_PASSWORD}@${postgres.hostname}:${postgres.port}/dealership`;
  const sql = new SQL(url);
  const [history] = await sql`SELECT to_regclass('public.migrations') IS NOT NULL AS typeorm`;
  if (history.typeorm) {
    await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    console.log('dealership: removed the old TypeORM schema');
  }
  await sql.close();
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
await migrateDealershipAsync();
await truncateAsync('dealership', [
  'processed_messages',
  'customers',
  'part_photos',
  'part_inventories',
  'bins',
  'parts',
]);
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

const seed = Bun.spawnSync(['bun', 'scripts/seed.ts'], {stdout: 'inherit', stderr: 'inherit'});
process.exit(seed.exitCode);
