// Calls the running system as one of the demo users, through the gateway, the way the web app does.
//
//   bun run api as rita GET /api/dealership/v1/system/user-context
//   bun run api as maria --location riverside GET /api/dealership/v1/stock
//   bun run api as maria POST /api/dealership/v1/parts '{"partNumber":"BP-100","description":"Brake pads","unitPrice":49}'
//   bun run api as sam --body GET /api/dealership/v1/customers/recent | jq '.[].id'
//   bun run api as rita --if-match 3 PUT /api/dealership/v1/customers/<id> '{…every field…}'
//
// It signs in through identity-api, starts at the user's default location unless --location is given, and prints the
// status, the correlation id and the JSON body. With --body, standard output is the JSON body alone, ready for jq; the
// status line goes to standard error, and the exit code still says whether the call succeeded. A save of a customer or
// a part needs --if-match with the version it starts from (the `version`, or ETag, of a GET; `*` for any): 428
// without it, 412 when someone saved a newer version first.
import { DEMO_USERS, callAsync, resourceUrl, signInAsync } from "./running-system";

function usage(message: string): never {
  console.error(
    `${message}\n\nUsage: bun run api as <${Object.keys(DEMO_USERS).join("|")}> [--location <name|code>] [--body] [--if-match <version|*>] <METHOD> <path> [json-body]`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] !== "as" || !args[1] || !DEMO_USERS[args[1]]) {
  usage('Missing or unknown "as <user>".');
}
const user = args[1];
let rest = args.slice(2);
let locationFilter: string | undefined;
let bodyOnly = false;
const headers: Record<string, string> = {};
// The options, in any order, before <METHOD>.
while (rest[0]?.startsWith("--")) {
  const [option, value] = rest;
  if (option === "--location") {
    locationFilter = value?.toLowerCase();
    rest = rest.slice(2);
  } else if (option === "--body") {
    bodyOnly = true;
    rest = rest.slice(1);
  } else if (option === "--if-match") {
    if (!value) {
      usage("--if-match needs a version (7) or *.");
    }
    headers["if-match"] = value === "*" ? "*" : `"${value.replaceAll('"', "")}"`;
    rest = rest.slice(2);
  } else {
    usage(`Unknown option ${option}.`);
  }
}
const [method, path, body] = rest;
if (!method || !path) {
  usage("Missing <METHOD> <path>.");
}

const gateway = resourceUrl("gateway-api", "http");
const session = await signInAsync(gateway, user);
const location = locationFilter
  ? session.locations.find((l) => l.name.toLowerCase() === locationFilter || l.code.toLowerCase() === locationFilter)
  : (session.locations.find((l) => l.id === session.defaultLocationId) ?? session.locations[0]);
if (!location) {
  usage(`${user} does not work at "${locationFilter}". Locations: ${session.locations.map((l) => l.name).join(", ")}`);
}

const response = await callAsync(gateway, session, location, method.toUpperCase(), path, body, true, headers);
const text = await response.text();
const report = bodyOnly ? console.error : console.log;
report(`${method.toUpperCase()} ${path} as ${user} @ ${location.name} (${location.role})`);
report(
  `→ ${response.status} ${response.statusText}   correlation-id: ${response.headers.get("x-correlation-id") ?? "-"}` +
    (response.headers.get("etag") ? `   etag: ${response.headers.get("etag")}` : ""),
);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
process.exit(response.ok ? 0 : 2);
