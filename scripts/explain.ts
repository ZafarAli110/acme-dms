// Shows how Postgres runs one query on the running system: its plan, with real row counts and timings.
//
//   bun run sql:explain "select id from customers where location_id = '<id>' order by last_contact_date desc limit 5"
//   bun run sql:explain --as maria "select id from customers order by surname limit 25"
//   bun run sql:explain --as maria --location riverside "<the SQL a span recorded, $1 and all>"
//   bun run sql:explain --db identity "select id from users where email = 'sam@northwind.test'"
//
// Only a select (or a with … select) is accepted, and it runs inside a read-only transaction that is rolled back, so
// nothing can change. Use it to back a performance finding with the plan instead of a guess or a stopwatch.
//
// --as <user> runs the query as that demo user's request does: the request role and their dealer and location (their
// default one, or --location). Row-level security then adds its filters to the plan, as it does for the real request;
// without --as the query runs as the database's owner, which no policy filters, and the plan can mislead.
//
// A query with placeholders ($1, $2: what `bun run spans dealership-api` records) gets the plan Postgres would use
// for any values (EXPLAIN GENERIC_PLAN), without row counts or times. Put real values in to measure it.
import { SQL } from "bun";
import { DEMO_USERS, callAsync, resourceUrl, signInAsync } from "./running-system";

const DEV_USER = "acme";
const DEV_PASSWORD = "acme";
const DATABASES = ["dealership", "identity", "documents"];
/** The role every dealership-api request runs as (REQUEST_ROLE in its unit of work); the policies are written for it. */
const REQUEST_ROLE = "dealership_api_user";

function usage(message: string): never {
  console.error(
    `${message}\n\nUsage: bun run sql:explain [--db <${DATABASES.join("|")}>] [--as <${Object.keys(DEMO_USERS).join("|")}> [--location <name|code>]] "<select …>"`,
  );
  process.exit(1);
}

let args = process.argv.slice(2);
let database = "dealership";
let asUser: string | null = null;
let locationFilter: string | null = null;
while (args[0]?.startsWith("--")) {
  const [option, value] = args;
  if (option === "--db") {
    database = value ?? "";
  } else if (option === "--as") {
    asUser = value ?? "";
  } else if (option === "--location") {
    locationFilter = (value ?? "").toLowerCase();
  } else {
    usage(`Unknown option ${option}.`);
  }
  args = args.slice(2);
}
if (!DATABASES.includes(database)) {
  usage(`Unknown database "${database}".`);
}
if (asUser !== null && (!DEMO_USERS[asUser] || database !== "dealership")) {
  usage("--as takes a demo user, and applies to the dealership database only (where the policies are).");
}
const query = (args[0] ?? "").trim().replace(/;\s*$/, "");
if (!/^(select|with)\b/i.test(query)) {
  usage("Give one select query, in quotes.");
}
if (query.includes(";")) {
  usage("One query only: no ; inside it.");
}

interface Scope {
  userId: string;
  dealerId: string;
  locationId: string;
}

/** The demo user's request scope, from the API itself: who it says they are at that location. */
async function scopeOfAsync(user: string): Promise<Scope> {
  const gateway = resourceUrl("gateway-api", "http");
  const session = await signInAsync(gateway, user);
  const location =
    session.locations.find(
      (candidate) =>
        locationFilter !== null &&
        (candidate.code.toLowerCase() === locationFilter || candidate.name.toLowerCase() === locationFilter),
    ) ??
    (locationFilter === null
      ? session.locations.find((candidate) => candidate.id === session.defaultLocationId)
      : null);
  if (!location) {
    usage(`${user} has no location "${locationFilter}". Theirs: ${session.locations.map((l) => l.code).join(", ")}`);
  }
  const response = await callAsync(gateway, session, location, "GET", "/api/dealership/v1/system/user-context");
  const context = (await response.json()) as { userId: string; dealerId: string; locationId: string | null };
  return { userId: context.userId, dealerId: context.dealerId, locationId: context.locationId ?? location.id };
}

const scope = asUser === null ? null : await scopeOfAsync(asUser);
const generic = /\$\d/.test(query);
const postgres = new URL(resourceUrl("postgres", "tcp").replace("tcp://", "http://"));
const sql = new SQL(`postgres://${DEV_USER}:${DEV_PASSWORD}@${postgres.hostname}:${postgres.port}/${database}`);
const connection = await sql.reserve();
try {
  await connection.unsafe("begin transaction read only");
  if (scope) {
    // As dealership-api's unit of work does, for this transaction only.
    await connection`select set_config('role', ${REQUEST_ROLE}, true), set_config('app.dealer_id', ${scope.dealerId}, true),
      set_config('app.location_id', ${scope.locationId}, true), set_config('app.user_id', ${scope.userId}, true)`;
    console.log(`As ${asUser}'s request: dealer ${scope.dealerId}, location ${scope.locationId}.`);
  }
  if (generic) {
    console.log("Placeholders: the plan for any values, without row counts or times. Put real values in to measure.");
  }
  const rows = (await connection.unsafe(
    `explain (${generic ? "generic_plan" : "analyze, buffers"}) ${query}`,
  )) as Record<string, string>[];
  for (const row of rows) {
    console.log(row["QUERY PLAN"]);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
} finally {
  await connection.unsafe("rollback");
  connection.release();
  await sql.close();
}
