// Where a load test's time goes: while it runs, once a second, how busy Postgres is (its connections and their waits,
// its container's CPU) and how busy the dealership-api processes are (their CPU). At the end, which of them was the
// limit, so nobody adds API copies to a database that is already full ("more servers in front of the same database
// only queue more requests on it").
//
// Postgres comes from its own statistics (pg_stat_activity), over the development connection `bun run sql:explain`
// uses. CPU comes from `docker stats` and `ps`: where they are missing (Windows has no `ps`), that line says
// "not measured", never a guess.
import { SQL } from "bun";
import { resourceUrl } from "./running-system";

interface Sample {
  activeConnections: number;
  waitingOnLocks: number;
  postgresCpu: number | null;
  apiCpu: number[] | null;
}

export interface LoadWatch {
  stopAsync: () => Promise<string[]>;
}

/** What each API process may use before it is the limit: one core, as Node runs JavaScript on one. */
const BUSY_PROCESS_CPU = 85;
const BUSY_POSTGRES_CPU = 80;

async function outputAsync(command: string[]): Promise<string | null> {
  try {
    const process = Bun.spawn(command, { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(process.stdout).text();
    return (await process.exited) === 0 ? text : null;
  } catch {
    return null;
  }
}

/** The CPU of the Postgres container, in percent of one core, or null when Docker cannot tell. */
async function postgresCpuAsync(): Promise<number | null> {
  const text = await outputAsync(["docker", "stats", "--no-stream", "--format", "{{.Name}} {{.CPUPerc}}"]);
  const line = text?.split("\n").find((candidate) => candidate.startsWith("postgres"));
  const percent = Number(line?.split(" ")[1]?.replace("%", ""));
  return Number.isFinite(percent) ? percent : null;
}

/** The CPU of each dealership-api process (node dist/main.js), or null when `ps` is missing. */
async function apiCpuAsync(): Promise<number[] | null> {
  const text = await outputAsync(["ps", "-A", "-o", "%cpu=,command="]);
  if (text === null) {
    return null;
  }
  return text
    .split("\n")
    .filter((line) => line.includes("dist/main.js") && line.includes("node"))
    .map((line) => Number(line.trim().split(/\s+/)[0]))
    .filter((percent) => Number.isFinite(percent));
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Starts watching; `stopAsync` ends it and gives the report's lines. */
export function watchLoad(): LoadWatch {
  const postgres = new URL(resourceUrl("postgres", "tcp").replace("tcp://", "http://"));
  const sql = new SQL(`postgres://acme:acme@${postgres.hostname}:${postgres.port}/dealership`, { max: 1 });
  const samples: Sample[] = [];
  let busy = false;

  const sampleAsync = async (): Promise<void> => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      const [activity] = (await sql`
        select count(*) filter (where state = 'active')::int as active,
               count(*) filter (where wait_event_type = 'Lock')::int as locks
        from pg_stat_activity
        where datname = 'dealership' and pid <> pg_backend_pid()`) as { active: number; locks: number }[];
      const [postgresCpu, apiCpu] = await Promise.all([postgresCpuAsync(), apiCpuAsync()]);
      samples.push({
        activeConnections: activity?.active ?? 0,
        waitingOnLocks: activity?.locks ?? 0,
        postgresCpu,
        apiCpu,
      });
    } catch {
      // One missed sample changes nothing; the report counts the samples it has.
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void sampleAsync(), 1000);

  return {
    stopAsync: async () => {
      clearInterval(timer);
      await sql.close();
      if (samples.length === 0) {
        return ["Where the time went: not measured (Postgres could not be read)."];
      }
      const active = samples.map((sample) => sample.activeConnections);
      const locks = samples.map((sample) => sample.waitingOnLocks);
      const postgresCpu = samples.flatMap((sample) => (sample.postgresCpu === null ? [] : [sample.postgresCpu]));
      const perProcess = samples.flatMap((sample) => sample.apiCpu ?? []);
      const processes = Math.max(0, ...samples.map((sample) => sample.apiCpu?.length ?? 0));

      const lines = [
        `Postgres: ${average(active).toFixed(1)} queries running on average (at most ${Math.max(...active)}), ` +
          `${Math.max(...locks)} at most waiting on a lock; CPU ` +
          (postgresCpu.length > 0 ? `${average(postgresCpu).toFixed(0)}% on average` : "not measured"),
        `dealership-api: ${processes} process(es); CPU ` +
          (perProcess.length > 0 ? `${average(perProcess).toFixed(0)}% of a core each on average` : "not measured"),
      ];
      const postgresFull = postgresCpu.length > 0 && average(postgresCpu) >= BUSY_POSTGRES_CPU;
      const lockBound = Math.max(...locks) > 0 && average(locks) >= 1;
      const apiFull = perProcess.length > 0 && average(perProcess) >= BUSY_PROCESS_CPU;
      if (postgresFull || lockBound) {
        lines.push(
          "The limit: the database. More API copies would only queue more queries on it. Look at the slowest kinds " +
            "above with `bun run sql:explain` (indexes, ACME-110), and at what waits on locks.",
        );
      } else if (apiFull) {
        lines.push(
          "The limit: the API processes, each near a full core. More copies help: DEALERSHIP_API_INSTANCES=<n> bun run dev.",
        );
      } else if (postgresCpu.length > 0 && perProcess.length > 0) {
        lines.push(
          "Neither the database nor the API processes were full: the limit is elsewhere (the gateway, this machine " +
            "running the test as well) or the load was not high enough. Raise --in-flight and --people.",
        );
      }
      return lines;
    },
  };
}
