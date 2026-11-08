// Which statements the database spent its time on, from Postgres's own record (pg_stat_statements): how often each
// ran, its total and average time, and its share of all of it. The question a load test's "the limit: the database"
// leaves open: which queries filled it.
//
//   bun run sql:top                       the 10 statements with the most total time, since the last reset
//   bun run sql:top --limit 20 --db identity
//   bun run sql:top --reset               start counting afresh (before a load test, so it measures only that run)
//
// Postgres keeps this record only with `pg_stat_statements` in shared_preload_libraries, which the AppHost sets; the
// script creates the extension in the database the first time. Statements are shown as Postgres normalises them ($1
// for every value), so one line is one shape of query, whatever the values. Read-only apart from the reset.
import { SQL } from "bun";
import { resourceUrl } from "./running-system";

const DEV_USER = "acme";
const DEV_PASSWORD = "acme";
const DATABASES = ["dealership", "identity", "documents", "gateway"];
const USAGE = `Usage: bun run sql:top [--db <${DATABASES.join("|")}>] [--limit N] [--reset]`;

let database = "dealership";
let limit = 10;
let reset = false;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const option = args[index];
  if (option === "--reset") {
    reset = true;
  } else if (option === "--db") {
    database = args[++index] ?? "";
  } else if (option === "--limit") {
    limit = Number(args[++index]);
  } else {
    console.error(`Unknown option ${option}. ${USAGE}`);
    process.exit(1);
  }
}
if (!DATABASES.includes(database) || !Number.isInteger(limit) || limit < 1) {
  console.error(USAGE);
  process.exit(1);
}

const postgres = new URL(resourceUrl("postgres", "tcp").replace("tcp://", "http://"));
const sql = new SQL(`postgres://${DEV_USER}:${DEV_PASSWORD}@${postgres.hostname}:${postgres.port}/${database}`);

try {
  const [loaded] = (await sql`select current_setting('shared_preload_libraries') as libraries`) as {
    libraries: string;
  }[];
  if (!loaded?.libraries.includes("pg_stat_statements")) {
    console.error(
      "Postgres was started without pg_stat_statements in shared_preload_libraries. Restart the system " +
        "(`bun run start:prod` or `bun run dev`): the AppHost starts Postgres with it.",
    );
    process.exit(1);
  }
  await sql`create extension if not exists pg_stat_statements`;
  if (reset) {
    await sql`select pg_stat_statements_reset()`;
    console.log(`Counting afresh in ${database}.`);
  } else {
    const rows = (await sql`
      select calls::bigint as calls,
             round(total_exec_time)::bigint as total_ms,
             round(mean_exec_time::numeric, 1) as mean_ms,
             round(100 * total_exec_time / nullif(sum(total_exec_time) over (), 0))::int as share,
             rows::bigint as rows,
             regexp_replace(query, '\\s+', ' ', 'g') as query
      from pg_stat_statements
      where dbid = (select oid from pg_database where datname = current_database())
      order by total_exec_time desc
      limit ${limit}`) as {
      calls: number;
      total_ms: number;
      mean_ms: string;
      share: number | null;
      rows: number;
      query: string;
    }[];
    console.log(
      `The statements with the most total time in ${database} (since the last \`bun run sql:top --reset\`):\n`,
    );
    console.log("| Share | Total ms | Calls | Mean ms | Rows | Statement |\n| --- | --- | --- | --- | --- | --- |");
    for (const row of rows) {
      const statement = row.query.length > 160 ? `${row.query.slice(0, 157)}…` : row.query;
      console.log(
        `| ${row.share ?? 0}% | ${row.total_ms} | ${row.calls} | ${row.mean_ms} | ${row.rows} | \`${statement}\` |`,
      );
    }
  }
} finally {
  await sql.close();
}
