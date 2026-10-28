// Applies dealership-api's migrations to a database without starting the service: `bun run db:migrate`, with
// DATABASE_URL set (scripts/reset.ts uses it after recreating the schema).
import {resolve} from 'node:path';
import {migrateDatabaseAsync} from '../src/persistence/migrations/migrate-database';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('Set DATABASE_URL to the dealership database, e.g. postgres://acme:acme@localhost:5432/dealership');
  process.exit(1);
}
await migrateDatabaseAsync(url, resolve(import.meta.dirname, '../src/persistence/migrations/drizzle'));
console.log('dealership: migrations applied');
