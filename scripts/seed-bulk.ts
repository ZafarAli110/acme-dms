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

// Names, places and businesses of a dealer group in the north of England. With about 120 first names and 150
// surnames, a million customers still share names (as real ones do), but no run of rows reads like a test fixture.
const FIRST_NAMES = (
  'Oliver Amelia George Isla Harry Ava Noah Mia Jack Ivy Leo Freya Arthur Florence Muhammad Lily Oscar Grace Charlie ' +
  'Sophia Henry Willow Theo Evie Alfie Ella Thomas Poppy Jacob Emily Freddie Rosie Archie Sienna William Daisy Joshua ' +
  'Phoebe James Matilda Lucas Harper Joseph Elsie Edward Alice Samuel Lucy Isaac Maya Daniel Chloe Max Hannah Ethan ' +
  'Zara Adam Aisha Ryan Amara Dylan Priya Callum Niamh Rhys Eilidh Owen Megan Liam Erin Connor Ruby Aidan Fatima Ben ' +
  'Holly Jamie Leah Kieran Amy Ravi Anika Tomasz Zofia Kwame Abena Chen Mei Hiroshi Yuki Ahmed Layla Omar Noor Ali ' +
  'Sara Dev Kiran Sanjay Neha Arjun Ananya Paul Susan David Karen Peter Julie Mark Helen Andrew Claire Stephen Joanne ' +
  'Michael Rachel Graham Nicola Ian Fiona Kevin Gillian Martin Lorraine Aaron Abigail Alex Amber Anthony Bethany ' +
  'Brandon Caitlin Carl Charlotte Christopher Courtney Darren Deborah Dominic Eleanor Elliot Emma Gareth Gemma Harvey ' +
  'Imogen Jake Jasmine Jordan Katie Lewis Lauren Luke Melissa Nathan Natalie Patrick Rebecca Robert Samantha Scott ' +
  'Shannon Simon Stacey Toby Victoria Wayne Yasmin Zainab Bilal Hamza Ibrahim Mariam Yusuf Sana'
).split(' ');
const SURNAMES = (
  'Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans Walker White Roberts Green ' +
  'Hall Wood Jackson Clarke Patel Khan Lewis James Phillips Mason Mitchell Rose Davis Rodriguez Cox Alexander Morgan ' +
  'Moore Mills King Shaw Lee Hughes Edwards Turner Hill Harris Martin Cooper Ward Morris Clark Baker Harrison Young ' +
  'Allen Scott Bell Carter Murphy Kelly Price Bailey Griffiths Watson Richardson Chapman Webb Ellis Hunt Palmer ' +
  'Holmes Lloyd Stevens Russell Fletcher Atkinson Pearson Dixon Bennett Barker Gibson Kaur Singh Ali Hussain Begum ' +
  "Ahmed Rahman Chowdhury Okafor Adeyemi Mensah Boateng Nowak Kowalski Wojcik Chen Wang Nguyen Tanaka O'Brien " +
  "O'Connor McKenzie MacDonald Campbell Stewart Fraser Henderson Whitaker Gallagher Lindqvist Moreau Rossi Fischer " +
  'Silva Haddad Sutcliffe Ackroyd Hargreaves Ormerod Pickles Greenwood Holroyd Lockwood Barraclough Haigh Crowther ' +
  'Firth Brooke Hirst Dawson Kershaw Booth Senior Fairclough Cartwright Pennington Whitworth Ramsbottom Entwistle ' +
  'Duckworth Haworth Heaton Ingham Marsden Nuttall Pilling Riley Schofield Shackleton Tattersall Wolstenholme'
).split(' ');
// Besides the list, English place names make surnames (Ashton, Bradley, Thornfield): about 830 surnames, picked evenly,
// and 180 first names, so one full name comes round about eight times in a million instead of seventy. Sorted by
// name, a page reads like a real customer book.
const SURNAME_STARTS = (
  'Ash Black Brad Brook Cal Cart Chad Clay Crow Dal Dun Elm Fair Fox Green Hal Hart Hay Hol Kirk Lang Mar Mid Mill ' +
  'Nor Oak Pen Ram Red Rush Shel Stan Stock Sut Thorn War Wes Whit Wood Wy'
).split(' ');
const SURNAME_ENDS = 'ton ley field wood worth ford by ham well wick den bridge croft shaw stead more hurst'.split(' ');
const SURNAME_COUNT = SURNAMES.length + SURNAME_STARTS.length * SURNAME_ENDS.length;
const CITIES = [
  'Leeds',
  'Bradford',
  'Huddersfield',
  'Halifax',
  'Wakefield',
  'Harrogate',
  'York',
  'Skipton',
  'Keighley',
  'Otley',
  'Ilkley',
  'Pudsey',
  'Dewsbury',
  'Batley',
  'Castleford',
  'Pontefract',
  'Selby',
  'Knaresborough',
  'Ripon',
  'Wetherby',
  'Holmfirth',
  'Hebden Bridge',
  'Todmorden',
  'Brighouse',
  'Morley',
  'Rothwell',
  'Garforth',
  'Tadcaster',
  'Shipley',
  'Bingley',
];
const COMPANIES = [
  'Hargreaves Haulage Ltd',
  'Pennine Plumbing & Heating',
  'Aire Valley Electrical',
  'Calder Roofing Services',
  'Dales Veterinary Practice',
  'Wharfedale Joinery',
  'Northern Rail Contractors',
  'Holroyd & Sons Builders',
  'Kirkstall Courier Co.',
  'Brighouse Bakery',
  'Moorside Landscapes',
  'Ackroyd Accountancy',
  'Leeds Mobile Tyres',
  'Yorkshire Dental Group',
  'Ridings Removals',
  'Fairweather Florists',
  'Skipton Scaffolding',
  'Castle Cleaning Co.',
  'Ilkley Interiors',
  'Riverside Physiotherapy',
  'Harrogate Hire Cars',
  'Ouse Valley Farms',
  'Bingley Brewing Co.',
  'Granary Wharf Catering',
  'Haigh & Barraclough Solicitors',
  'White Rose Security',
  'Crowther Engineering',
  'Calderdale Care Services',
  'Otley Organic Grocers',
  'Shipley Signs & Print',
];
const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.co.uk', 'yahoo.co.uk', 'btinternet.com', 'icloud.com'];

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
    SELECT '${locationId}', person.first_name, person.surname,
           CASE WHEN abs(hashint4(i * 5)) % 8 = 0 THEN (${textArray(COMPANIES)})[1 + abs(hashint4(i * 11)) % ${COMPANIES.length}] END,
           -- An email for most, built from the name; a mobile number for most.
           CASE WHEN abs(hashint4(i * 19)) % 6 <> 0 THEN
             lower(person.first_name) || '.' || lower(regexp_replace(person.surname, '[^A-Za-z]', '', 'g'))
             || (abs(hashint4(i * 23)) % 100)::text || '@' || (${textArray(EMAIL_DOMAINS)})[1 + abs(hashint4(i * 29)) % ${EMAIL_DOMAINS.length}]
           END,
           CASE WHEN abs(hashint4(i * 31)) % 4 <> 0 THEN
             '07' || lpad((abs(hashint4(i * 37)) % 1000)::text, 3, '0') || ' ' || lpad((abs(hashint4(i * 41)) % 1000000)::text, 6, '0')
           END,
           (${textArray(CITIES)})[1 + abs(hashint4(i * 3)) % ${CITIES.length}],
           (ARRAY['active', 'active', 'active', 'prospect', 'inactive'])[1 + abs(hashint4(i * 43)) % 5],
           CASE WHEN abs(hashint4(i * 47)) % 11 <> 0 THEN date '2023-01-01' + (abs(hashint4(i * 13)) % 1400) END,
           now(), '${CREATED_BY}', now(), '${CREATED_BY}'
    FROM generate_series(1, ${count}) AS i,
         LATERAL (SELECT (${textArray(FIRST_NAMES)})[1 + abs(hashint4(i)) % ${FIRST_NAMES.length}] AS first_name,
                         CASE WHEN abs(hashint4(i * 7)) % ${SURNAME_COUNT} < ${SURNAMES.length}
                           THEN (${textArray(SURNAMES)})[1 + abs(hashint4(i * 7)) % ${SURNAME_COUNT}]
                           ELSE (${textArray(SURNAME_STARTS)})[1 + (abs(hashint4(i * 7)) % ${SURNAME_COUNT} - ${SURNAMES.length}) / ${SURNAME_ENDS.length}]
                             || (${textArray(SURNAME_ENDS)})[1 + (abs(hashint4(i * 7)) % ${SURNAME_COUNT} - ${SURNAMES.length}) % ${SURNAME_ENDS.length}]
                         END AS surname) AS person`);
  console.log(
    `${name}: ${count.toLocaleString('en-GB')} customers in ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );
}

await seedLocationAsync(NORTHSIDE, 'Northside', northside);
await seedLocationAsync(RIVERSIDE, 'Riverside', riverside);
await sql.unsafe('ANALYZE customers');
await sql.close();
