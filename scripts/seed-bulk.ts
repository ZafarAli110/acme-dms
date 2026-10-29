// A merged dealer group's customer book: 1.2 million customers at Northside and 400,000 at Riverside (ACME-108).
// Written straight into the dealership database with one INSERT … SELECT per location, so it takes seconds, not hours
// of API calls. Run `bun run seed` first; `bun run reset` removes these customers with the rest of the business data.
//
//   bun run seed:bulk                 the default sizes
//   bun run seed:bulk 50000 20000     smaller, for a quick look
import {SQL} from 'bun';
import {resourceUrl} from './running-system';

const DEV_USER = 'acme';
const DEV_PASSWORD = 'acme';
const NORTHSIDE = '20000000-0000-0000-0000-000000000001';
const RIVERSIDE = '20000000-0000-0000-0000-000000000002';
/** Maria, the manager: who the rows say created them. */
const CREATED_BY = '30000000-0000-0000-0000-000000000002';

const FIRST_NAMES = [
  'Amara',
  'Ben',
  'Chloe',
  'Dev',
  'Elena',
  'Finn',
  'Grace',
  'Hiro',
  'Isla',
  'Jonas',
  'Kemi',
  'Liam',
  'Maya',
  'Noah',
  'Olivia',
  'Priya',
  'Quinn',
  'Rosa',
  'Sven',
  'Tara',
  'Umar',
  'Vera',
  'Wen',
  'Yusuf',
  'Zoe',
];
const SURNAMES = [
  'Okafor',
  'Whitaker',
  'Martin',
  'Patel',
  'Rossi',
  'Gallagher',
  'Hopper',
  'Tanaka',
  'McKenzie',
  'Berg',
  'Adeyemi',
  "O'Brien",
  'Novak',
  'Lindqvist',
  'Moreau',
  'Fischer',
  'Silva',
  'Kowalski',
  'Nguyen',
  'Haddad',
];
const CITIES = ['Northside', 'Hillcrest', 'Oakfield', 'Riverside', 'Millbrook', 'Ashford', 'Kingsbridge', 'Elmwood'];
const COMPANIES = [
  'Whitaker Plumbing',
  'Patel & Sons Couriers',
  'Berg Garden Services',
  'Hopper Logistics',
  'Silva Electrical',
  '50% Off Tyres Ltd',
];

const [northside = 1_200_000, riverside = 400_000] = process.argv.slice(2).map(Number);

function textArray(values: string[]): string {
  return `ARRAY[${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ')}]`;
}

const postgres = new URL(resourceUrl('postgres', 'tcp').replace('tcp://', 'http://'));
const sql = new SQL(`postgres://${DEV_USER}:${DEV_PASSWORD}@${postgres.hostname}:${postgres.port}/dealership`);

async function seedLocationAsync(locationId: string, name: string, count: number): Promise<void> {
  const started = performance.now();
  // hashint4 spreads the values so neighbouring rows differ; the same count always gives the same customers.
  await sql.unsafe(`
    INSERT INTO customers (location_id, first_name, surname, company_name, email, phone, city, status, last_contact_date,
                           created_at, created_by, updated_at, updated_by)
    SELECT '${locationId}',
           (${textArray(FIRST_NAMES)})[1 + abs(hashint4(i)) % ${FIRST_NAMES.length}],
           (${textArray(SURNAMES)})[1 + abs(hashint4(i * 7)) % ${SURNAMES.length}],
           CASE WHEN i % 9 = 0 THEN (${textArray(COMPANIES)})[1 + i % ${COMPANIES.length}] END,
           CASE WHEN i % 6 <> 0 THEN 'customer' || i || '@bulk.test' END,
           CASE WHEN i % 4 <> 0 THEN '+44 7700 ' || lpad((i % 1000000)::text, 6, '0') END,
           (${textArray(CITIES)})[1 + abs(hashint4(i * 3)) % ${CITIES.length}],
           (ARRAY['active', 'active', 'active', 'prospect', 'inactive'])[1 + i % 5],
           CASE WHEN i % 11 <> 0 THEN date '2023-01-01' + (abs(hashint4(i * 13)) % 1400) END,
           now(), '${CREATED_BY}', now(), '${CREATED_BY}'
    FROM generate_series(1, ${count}) AS i`);
  console.log(
    `${name}: ${count.toLocaleString('en-GB')} customers in ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );
}

await seedLocationAsync(NORTHSIDE, 'Northside', northside);
await seedLocationAsync(RIVERSIDE, 'Riverside', riverside);
await sql.unsafe('ANALYZE customers');
await sql.close();
