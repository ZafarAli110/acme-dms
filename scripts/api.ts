// Calls the running system as one of the demo users, through the gateway, the way the web app does.
//
//   bun run api as rita GET /api/dealership/v1/system/user-context
//   bun run api as maria --location riverside GET /api/dealership/v1/stock
//   bun run api as maria POST /api/dealership/v1/parts '{"partNumber":"BP-100","description":"Brake pads","unitPrice":49}'
//
// It signs in through identity-api, picks the user's first location unless --location is given, and prints the
// status, the correlation id and the JSON body.
import {DEMO_USERS, callAsync, resourceUrl, signInAsync} from './running-system';

function usage(message: string): never {
  console.error(
    `${message}\n\nUsage: bun run api as <${Object.keys(DEMO_USERS).join('|')}> [--location <name|code>] <METHOD> <path> [json-body]`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] !== 'as' || !args[1] || !DEMO_USERS[args[1]]) {
  usage('Missing or unknown "as <user>".');
}
const user = args[1];
let rest = args.slice(2);
let locationFilter: string | undefined;
if (rest[0] === '--location') {
  locationFilter = rest[1]?.toLowerCase();
  rest = rest.slice(2);
}
const [method, path, body] = rest;
if (!method || !path) {
  usage('Missing <METHOD> <path>.');
}

const gateway = resourceUrl('gateway', 'http');
const session = await signInAsync(gateway, user);
const location = locationFilter
  ? session.locations.find((l) => l.name.toLowerCase() === locationFilter || l.code.toLowerCase() === locationFilter)
  : session.locations[0];
if (!location) {
  usage(`${user} does not work at "${locationFilter}". Locations: ${session.locations.map((l) => l.name).join(', ')}`);
}

const response = await callAsync(gateway, session, location, method.toUpperCase(), path, body);
const text = await response.text();
console.log(`${method.toUpperCase()} ${path} as ${user} @ ${location.name} (${location.role})`);
console.log(
  `→ ${response.status} ${response.statusText}   correlation-id: ${response.headers.get('x-correlation-id') ?? '-'}`,
);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
process.exit(response.ok ? 0 : 2);
