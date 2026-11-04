// Shows how Postgres runs one query on the running system: its plan, with real row counts and timings.
//
//   bun run sql:explain "select id from customers where location_id = '<id>' order by last_contact_date desc limit 5"
//   bun run sql:explain --db identity "select id from users where email = 'sam@northwind.test'"
//
// Only a select (or a with … select) is accepted, and it runs inside a read-only transaction that is rolled back, so
// nothing can change. Use it to back a performance finding with the plan instead of a guess or a stopwatch.
import { SQL } from "bun";
import { resourceUrl } from "./running-system";

const DEV_USER = "acme";
const DEV_PASSWORD = "acme";
const DATABASES = ["dealership", "identity", "documents"];

function usage(message: string): never {
  console.error(`${message}\n\nUsage: bun run sql:explain [--db <${DATABASES.join("|")}>] "<select …>"`);
  process.exit(1);
}

let args = process.argv.slice(2);
let database = "dealership";
if (args[0] === "--db") {
  database = args[1] ?? "";
  args = args.slice(2);
}
if (!DATABASES.includes(database)) {
  usage(`Unknown database "${database}".`);
}
const query = (args[0] ?? "").trim().replace(/;\s*$/, "");
if (!/^(select|with)\b/i.test(query)) {
  usage("Give one select query, in quotes.");
}
if (query.includes(";")) {
  usage("One query only: no ; inside it.");
}

const postgres = new URL(resourceUrl("postgres", "tcp").replace("tcp://", "http://"));
const sql = new SQL(`postgres://${DEV_USER}:${DEV_PASSWORD}@${postgres.hostname}:${postgres.port}/${database}`);
const connection = await sql.reserve();
try {
  await connection.unsafe("begin transaction read only");
  const rows = (await connection.unsafe(`explain (analyze, buffers) ${query}`)) as Record<string, string>[];
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
