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
