// A merged dealer group's customer book: 1.6 million customers at Northside, 400,000 at Riverside and 250,000 at
// Westgate (ACME-108), and its parts catalogue: 60,000 parts, stocked 40% at Northside, 30% at Riverside and 20% at
// Westgate (ACME-123).
// Written straight into the dealership database with one INSERT … SELECT per location, so it takes seconds, not hours
// of API calls. Run `bun run seed` first; `bun run reset` removes these customers with the rest of the business data.
//
//   bun run seed:bulk                     the default sizes
//   bun run seed:bulk 50000 20000 10000   smaller, for a quick look (a fourth number: the parts, 60000 by default)
import { SQL } from "bun";
import { resourceUrl } from "./running-system";

const DEV_USER = "acme";
const DEV_PASSWORD = "acme";
/** Northwind Motors: every bulk customer belongs to it. */
const NORTHWIND = "10000000-0000-0000-0000-000000000001";
const NORTHSIDE = "20000000-0000-0000-0000-000000000001";
const RIVERSIDE = "20000000-0000-0000-0000-000000000002";
const WESTGATE = "20000000-0000-0000-0000-000000000003";
/** Maria, the manager: who the rows say created them. */
const CREATED_BY = "30000000-0000-0000-0000-000000000002";

// Names, places and businesses of a dealer group in the north of England. With about 120 first names and 150
// surnames, a million customers still share names (as real ones do), but no run of rows reads like a test fixture.
const FIRST_NAMES = (
  "Oliver Amelia George Isla Harry Ava Noah Mia Jack Ivy Leo Freya Arthur Florence Muhammad Lily Oscar Grace Charlie " +
  "Sophia Henry Willow Theo Evie Alfie Ella Thomas Poppy Jacob Emily Freddie Rosie Archie Sienna William Daisy Joshua " +
  "Phoebe James Matilda Lucas Harper Joseph Elsie Edward Alice Samuel Lucy Isaac Maya Daniel Chloe Max Hannah Ethan " +
  "Zara Adam Aisha Ryan Amara Dylan Priya Callum Niamh Rhys Eilidh Owen Megan Liam Erin Connor Ruby Aidan Fatima Ben " +
  "Holly Jamie Leah Kieran Amy Ravi Anika Tomasz Zofia Kwame Abena Chen Mei Hiroshi Yuki Ahmed Layla Omar Noor Ali " +
  "Sara Dev Kiran Sanjay Neha Arjun Ananya Paul Susan David Karen Peter Julie Mark Helen Andrew Claire Stephen Joanne " +
  "Michael Rachel Graham Nicola Ian Fiona Kevin Gillian Martin Lorraine Aaron Abigail Alex Amber Anthony Bethany " +
  "Brandon Caitlin Carl Charlotte Christopher Courtney Darren Deborah Dominic Eleanor Elliot Emma Gareth Gemma Harvey " +
  "Imogen Jake Jasmine Jordan Katie Lewis Lauren Luke Melissa Nathan Natalie Patrick Rebecca Robert Samantha Scott " +
  "Shannon Simon Stacey Toby Victoria Wayne Yasmin Zainab Bilal Hamza Ibrahim Mariam Yusuf Sana"
).split(" ");
const SURNAMES = (
  "Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans Walker White Roberts Green " +
  "Hall Wood Jackson Clarke Patel Khan Lewis James Phillips Mason Mitchell Rose Davis Rodriguez Cox Alexander Morgan " +
  "Moore Mills King Shaw Lee Hughes Edwards Turner Hill Harris Martin Cooper Ward Morris Clark Baker Harrison Young " +
  "Allen Scott Bell Carter Murphy Kelly Price Bailey Griffiths Watson Richardson Chapman Webb Ellis Hunt Palmer " +
  "Holmes Lloyd Stevens Russell Fletcher Atkinson Pearson Dixon Bennett Barker Gibson Kaur Singh Ali Hussain Begum " +
  "Ahmed Rahman Chowdhury Okafor Adeyemi Mensah Boateng Nowak Kowalski Wojcik Chen Wang Nguyen Tanaka O'Brien " +
  "O'Connor McKenzie MacDonald Campbell Stewart Fraser Henderson Whitaker Gallagher Lindqvist Moreau Rossi Fischer " +
  "Silva Haddad Sutcliffe Ackroyd Hargreaves Ormerod Pickles Greenwood Holroyd Lockwood Barraclough Haigh Crowther " +
  "Firth Brooke Hirst Dawson Kershaw Booth Senior Fairclough Cartwright Pennington Whitworth Ramsbottom Entwistle " +
  "Duckworth Haworth Heaton Ingham Marsden Nuttall Pilling Riley Schofield Shackleton Tattersall Wolstenholme"
).split(" ");
// Besides the list, English place names make surnames (Ashton, Bradley, Thornfield): about 830 surnames, picked evenly,
// and 180 first names, so one full name comes round about eight times in a million instead of seventy. Sorted by
// name, a page reads like a real customer book.
const SURNAME_STARTS = (
  "Ash Black Brad Brook Cal Cart Chad Clay Crow Dal Dun Elm Fair Fox Green Hal Hart Hay Hol Kirk Lang Mar Mid Mill " +
  "Nor Oak Pen Ram Red Rush Shel Stan Stock Sut Thorn War Wes Whit Wood Wy"
).split(" ");
const SURNAME_ENDS = "ton ley field wood worth ford by ham well wick den bridge croft shaw stead more hurst".split(" ");
const SURNAME_COUNT = SURNAMES.length + SURNAME_STARTS.length * SURNAME_ENDS.length;
const CITIES = [
  "Leeds",
  "Bradford",
  "Huddersfield",
  "Halifax",
  "Wakefield",
  "Harrogate",
  "York",
  "Skipton",
  "Keighley",
  "Otley",
  "Ilkley",
  "Pudsey",
  "Dewsbury",
  "Batley",
  "Castleford",
  "Pontefract",
  "Selby",
  "Knaresborough",
  "Ripon",
  "Wetherby",
  "Holmfirth",
  "Hebden Bridge",
  "Todmorden",
  "Brighouse",
  "Morley",
  "Rothwell",
  "Garforth",
  "Tadcaster",
  "Shipley",
  "Bingley",
];
const COMPANIES = [
  "Hargreaves Haulage Ltd",
  "Pennine Plumbing & Heating",
  "Aire Valley Electrical",
  "Calder Roofing Services",
  "Dales Veterinary Practice",
  "Wharfedale Joinery",
  "Northern Rail Contractors",
  "Holroyd & Sons Builders",
  "Kirkstall Courier Co.",
  "Brighouse Bakery",
  "Moorside Landscapes",
  "Ackroyd Accountancy",
  "Leeds Mobile Tyres",
  "Yorkshire Dental Group",
  "Ridings Removals",
  "Fairweather Florists",
  "Skipton Scaffolding",
  "Castle Cleaning Co.",
  "Ilkley Interiors",
  "Riverside Physiotherapy",
  "Harrogate Hire Cars",
  "Ouse Valley Farms",
  "Bingley Brewing Co.",
  "Granary Wharf Catering",
  "Haigh & Barraclough Solicitors",
  "White Rose Security",
  "Crowther Engineering",
  "Calderdale Care Services",
  "Otley Organic Grocers",
  "Shipley Signs & Print",
];
const EMAIL_DOMAINS = ["gmail.com", "outlook.com", "hotmail.co.uk", "yahoo.co.uk", "btinternet.com", "icloud.com"];

const [northside = 1_600_000, riverside = 400_000, westgate = 250_000, catalogue = 60_000] = process.argv
  .slice(2)
  .map(Number);

function textArray(values: string[]): string {
  return `ARRAY[${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")}]`;
}

const postgres = new URL(resourceUrl("postgres", "tcp").replace("tcp://", "http://"));
const sql = new SQL(`postgres://${DEV_USER}:${DEV_PASSWORD}@${postgres.hostname}:${postgres.port}/dealership`);

/** `first` is where the location's run of row numbers starts, so each rooftop gets different people. */
async function seedLocationAsync(locationId: string, name: string, first: number, count: number): Promise<void> {
  const started = performance.now();
  // hashint4 spreads the values so neighbouring rows differ; the same count always gives the same customers.
  await sql.unsafe(`
    INSERT INTO customers (dealer_id, location_id, first_name, surname, company_name, email, phone, city, status, last_contact_date,
                           created_at, created_by, updated_at, updated_by)
    SELECT '${NORTHWIND}', '${locationId}', person.first_name, person.surname,
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
    FROM generate_series(${first}, ${first + count - 1}) AS i,
         LATERAL (SELECT (${textArray(FIRST_NAMES)})[1 + abs(hashint4(i)) % ${FIRST_NAMES.length}] AS first_name,
                         CASE WHEN abs(hashint4(i * 7)) % ${SURNAME_COUNT} < ${SURNAMES.length}
                           THEN (${textArray(SURNAMES)})[1 + abs(hashint4(i * 7)) % ${SURNAME_COUNT}]
                           ELSE (${textArray(SURNAME_STARTS)})[1 + (abs(hashint4(i * 7)) % ${SURNAME_COUNT} - ${SURNAMES.length}) / ${SURNAME_ENDS.length}]
                             || (${textArray(SURNAME_ENDS)})[1 + (abs(hashint4(i * 7)) % ${SURNAME_COUNT} - ${SURNAMES.length}) % ${SURNAME_ENDS.length}]
                         END AS surname) AS person`);
  console.log(
    `${name}: ${count.toLocaleString("en-GB")} customers in ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );
}

// The parts catalogue (ACME-123): what each family is, where on the car it goes, how it is made, and what it fits.
// Combined, they give a few thousand distinct descriptions, so 60,000 parts read like a catalogue (one part from
// several makers shares a description) and a word such as "brake" or "filter" matches thousands, as in a real one.
const PART_FAMILIES: [code: string, name: string, positions: string[]][] = [
  ["BRK-PAD", "Brake pad set", ["front", "rear"]],
  ["BRK-DSC", "Brake disc", ["front", "rear"]],
  ["BRK-CAL", "Brake caliper", ["front left", "front right", "rear left", "rear right"]],
  ["BRK-HSE", "Brake hose", ["front", "rear"]],
  ["FLT-OIL", "Oil filter", ["spin-on", "cartridge"]],
  ["FLT-AIR", "Air filter", ["panel", "round"]],
  ["FLT-CAB", "Cabin filter", ["pollen", "activated carbon"]],
  ["FLT-FUE", "Fuel filter", ["inline", "cartridge"]],
  ["WPR-BLD", "Wiper blade", ["front", "rear"]],
  ["SPK-PLG", "Spark plug", ["iridium", "platinum", "nickel"]],
  ["BLT-AUX", "Auxiliary belt", ["ribbed"]],
  ["BLT-TIM", "Timing belt kit", ["with water pump", "without water pump"]],
  ["PMP-WAT", "Water pump", ["mechanical", "electric"]],
  ["SHK-ABS", "Shock absorber", ["front", "rear"]],
  ["SPR-COI", "Coil spring", ["front", "rear"]],
  ["ARM-CTL", "Control arm", ["front left", "front right"]],
  ["LNK-STB", "Anti-roll bar link", ["front", "rear"]],
  ["BTR-12V", "Battery 12 V", ["70 Ah", "80 Ah", "95 Ah"]],
  ["CLT-KIT", "Clutch kit", ["three-piece", "with flywheel"]],
  ["EXH-SIL", "Exhaust silencer", ["rear", "centre"]],
  ["SNS-OXY", "Oxygen sensor", ["upstream", "downstream"]],
  ["SNS-ABS", "Wheel speed sensor", ["front", "rear"]],
  ["LMP-HED", "Headlamp bulb", ["H7", "H4", "LED"]],
  ["RAD-ENG", "Radiator", ["manual gearbox", "automatic gearbox"]],
  ["THR-STA", "Thermostat", ["with housing", "insert"]],
  ["CVJ-DRV", "Drive shaft joint", ["outer", "inner"]],
  ["MNT-ENG", "Engine mount", ["front", "rear", "gearbox side"]],
  ["GSK-HED", "Cylinder head gasket", ["multi-layer steel"]],
];
const PART_GRADES = ["", "premium", "economy", "heavy duty", "low dust", "original equipment"];
const FITMENTS = (
  "Focus 2018-2022,Fiesta 2017-2023,Puma 2019-2024,Golf 2013-2020,Golf 2020-2024,Polo 2017-2024,Corsa 2019-2024," +
  "Astra 2015-2021,Octavia 2020-2024,Fabia 2015-2021,Qashqai 2014-2021,Juke 2019-2024,Clio 2019-2024," +
  "Megane 2016-2022,Yaris 2020-2024,Corolla 2019-2024,C-Class 2014-2021,3 Series 2019-2024,A3 2020-2024," +
  "Civic 2017-2022,Tucson 2020-2024,Sportage 2016-2021,208 2019-2024,Transit Custom 2018-2023,Sprinter 2018-2024"
).split(",");
const PART_TEMPLATES = PART_FAMILIES.flatMap(([code, name, positions]) =>
  positions.map((position) => ({ code, text: `${name}, ${position}` })),
);

/** The catalogue at Northwind, and its stock at the three rooftops, each part in one of the rooftop's bins. */
async function seedCatalogueAsync(count: number): Promise<void> {
  const started = performance.now();
  // Seven-digit numbers (2,000,001 on), so they never meet the six-digit parts the end-to-end tests add.
  await sql.unsafe(`
    WITH made AS (
      INSERT INTO parts (dealer_id, part_number, description, unit_price, created_at, created_by, updated_at, updated_by)
      SELECT '${NORTHWIND}',
             (${textArray(PART_TEMPLATES.map((template) => template.code))})[t] || '-' || (2000000 + i)::text,
             (${textArray(PART_TEMPLATES.map((template) => template.text))})[t]
               || coalesce(', ' || nullif((${textArray(PART_GRADES)})[1 + abs(hashint4(i * 17)) % ${PART_GRADES.length}], ''), '')
               || ', ' || (${textArray(FITMENTS)})[1 + abs(hashint4(i * 19)) % ${FITMENTS.length}],
             (2 + abs(hashint4(i * 23)) % 400)::numeric + (abs(hashint4(i * 29)) % 100)::numeric / 100,
             now(), '${CREATED_BY}', now(), '${CREATED_BY}'
      FROM generate_series(1, ${count}) AS i,
           LATERAL (SELECT 1 + abs(hashint4(i * 13)) % ${PART_TEMPLATES.length} AS t) AS template
      ON CONFLICT DO NOTHING
      RETURNING id, (right(part_number, 7)::int - 2000000) AS i
    ),
    shares (location_id, percent, salt) AS (
      VALUES ('${NORTHSIDE}'::uuid, 40, 31), ('${RIVERSIDE}'::uuid, 30, 37), ('${WESTGATE}'::uuid, 20, 41)
    ),
    location_bins AS (
      SELECT location_id, array_agg(id ORDER BY code) AS bin_ids FROM bins WHERE NOT is_deleted GROUP BY location_id
    )
    INSERT INTO part_inventories (dealer_id, location_id, part_id, bin_id, quantity_on_hand, reorder_level,
                                  created_at, created_by, updated_at, updated_by)
    SELECT '${NORTHWIND}', shares.location_id, made.id,
           location_bins.bin_ids[1 + abs(hashint4(made.i * shares.salt)) % cardinality(location_bins.bin_ids)],
           abs(hashint4(made.i * 43)) % 40, abs(hashint4(made.i * 47)) % 6,
           now(), '${CREATED_BY}', now(), '${CREATED_BY}'
    FROM made
    CROSS JOIN shares
    JOIN location_bins ON location_bins.location_id = shares.location_id
    WHERE abs(hashint4(made.i * shares.salt)) % 100 < shares.percent`);
  console.log(
    `Northwind: ${count.toLocaleString("en-GB")} catalogue parts and their stock in ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );
}

await seedLocationAsync(NORTHSIDE, "Northside", 1, northside);
await seedLocationAsync(RIVERSIDE, "Riverside", 10_000_001, riverside);
await seedLocationAsync(WESTGATE, "Westgate", 20_000_001, westgate);
await seedCatalogueAsync(catalogue);
await sql.unsafe("ANALYZE customers, parts, part_inventories");
await sql.close();
