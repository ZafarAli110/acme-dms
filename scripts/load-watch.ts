// What a load test used, and where its time went: once a second, how busy Postgres is (its connections, what waits on
// a lock, its container's CPU and memory) and what each part of the system uses (the CPU and memory of every
// dealership-api copy, the export worker and the .NET services). `nowLine` gives a short live line while the test runs;
// `stopAsync` the report and which part was the limit, so nobody adds API copies to a database that is already full
// ("more servers in front of the same database only queue more requests on it").
//
// Postgres comes from its own statistics (pg_stat_activity), over the development connection `bun run sql:explain`
// uses. CPU and memory come from `docker stats` and `ps`: where they are missing (Windows has no `ps`), that line says
// "not measured", never a guess.
import { SQL } from "bun";

/** One process's use: CPU in percent of one core, resident memory in MB. */
interface Use {
  cpu: number;
  memoryMb: number;
}

interface Sample {
  activeConnections: number;
  openConnections: number;
  waitingOnLocks: number;
  postgres: Use | null;
  /** By part of the system ("dealership-api", "gateway-api" …), one entry per process; null when `ps` is missing. */
  processes: Map<string, Use[]> | null;
}

export interface LoadWatch {
  /** The latest sample in one line, for the live progress. */
  nowLine: () => string;
  stopAsync: () => Promise<string[]>;
}

/** What each API process may use before it is the limit: one core, as Node runs JavaScript on one. */
const BUSY_PROCESS_CPU = 85;
const BUSY_POSTGRES_CPU = 80;
/** Connections count as all busy when this share of the open ones runs a query, on average. */
const BUSY_CONNECTIONS = 0.9;

/** The parts of the system, by what their command line contains; the order is the report's. */
const PARTS: { name: string; matches: (command: string) => boolean }[] = [
  { name: "dealership-api", matches: (command) => command.includes("node") && command.includes("dist/main.js") },
  { name: "export-worker", matches: (command) => command.includes("node") && command.includes("dist/worker.js") },
  { name: "gateway-api", matches: (command) => command.includes("Acme.Gateway.Service") },
  { name: "identity-api", matches: (command) => command.includes("Acme.Identity.Service") },
  { name: "document-api", matches: (command) => command.includes("Acme.Documents.Service") },
];

async function outputAsync(command: string[]): Promise<string | null> {
  try {
    const process = Bun.spawn(command, { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(process.stdout).text();
    return (await process.exited) === 0 ? text : null;
  } catch {
    return null;
  }
}

/** "183.4MiB" → 183.4; Docker writes B, kB, KiB, MB, MiB, GB or GiB. */
function megabytes(text: string): number {
  const match = /^([\d.]+)\s*([kKMG]?i?B)$/.exec(text.trim());
  if (!match) {
    return Number.NaN;
  }
  const value = Number(match[1]);
  const unit = (match[2] ?? "B").toUpperCase().replace("I", "");
  const factor: Record<string, number> = { B: 1 / 1_048_576, KB: 1 / 1024, MB: 1, GB: 1024 };
  return value * (factor[unit] ?? Number.NaN);
}

/** The Postgres container's CPU (percent of one core) and memory, or null when Docker cannot tell. */
async function postgresUseAsync(): Promise<Use | null> {
  const text = await outputAsync([
    "docker",
    "stats",
    "--no-stream",
    "--format",
    "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}",
  ]);
  const line = text?.split("\n").find((candidate) => candidate.startsWith("postgres"));
  const [, cpuText, memoryText] = line?.split("|") ?? [];
  const cpu = Number(cpuText?.replace("%", ""));
  const memoryMb = megabytes(memoryText?.split("/")[0] ?? "");
  return Number.isFinite(cpu) && Number.isFinite(memoryMb) ? { cpu, memoryMb } : null;
}

/** Each part's processes and what each uses, or null when `ps` is missing. */
async function processUseAsync(): Promise<Map<string, Use[]> | null> {
  const text = await outputAsync(["ps", "-A", "-o", "%cpu=,rss=,command="]);
  if (text === null) {
    return null;
  }
  const byPart = new Map<string, Use[]>(PARTS.map((part) => [part.name, []]));
  for (const line of text.split("\n")) {
    const [cpuText, rssText, ...words] = line.trim().split(/\s+/);
    const command = words.join(" ");
    // `dotnet run --project …` only starts the service (bun run dev); the service is its own process.
    if (command.includes(" run --project ")) {
      continue;
    }
    const part = PARTS.find((candidate) => candidate.matches(command));
    const cpu = Number(cpuText);
    const memoryMb = Number(rssText) / 1024;
    if (part && Number.isFinite(cpu) && Number.isFinite(memoryMb)) {
      byPart.get(part.name)?.push({ cpu, memoryMb });
    }
  }
  return byPart;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function most(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

/**
 * Starts watching; `stopAsync` ends it and gives the report's lines. `postgresUrl` is `resourceUrl("postgres", "tcp")`,
 * looked up before the test starts sending: looking it up asks the Aspire CLI and blocks for a second or two.
 */
export function watchLoad(postgresUrl: string): LoadWatch {
  const postgres = new URL(postgresUrl.replace("tcp://", "http://"));
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
               count(*)::int as open,
               count(*) filter (where wait_event_type = 'Lock')::int as locks
        from pg_stat_activity
        where datname = 'dealership' and backend_type = 'client backend' and pid <> pg_backend_pid()`) as {
        active: number;
        open: number;
        locks: number;
      }[];
      const [postgresUse, processes] = await Promise.all([postgresUseAsync(), processUseAsync()]);
      samples.push({
        activeConnections: activity?.active ?? 0,
        openConnections: activity?.open ?? 0,
        waitingOnLocks: activity?.locks ?? 0,
        postgres: postgresUse,
        processes,
      });
    } catch {
      // One missed sample changes nothing; the report counts the samples it has.
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void sampleAsync(), 1000);

  return {
    nowLine: () => {
      const latest = samples.at(-1);
      if (!latest) {
        return "";
      }
      const api = latest.processes?.get("dealership-api") ?? [];
      return (
        `Postgres ${latest.postgres ? `CPU ${latest.postgres.cpu.toFixed(0)}%` : "CPU ?"}, ` +
        `${latest.activeConnections} of ${latest.openConnections} connections busy; ` +
        `dealership-api CPU ${api.length > 0 ? `${average(api.map((use) => use.cpu)).toFixed(0)}% each` : "?"}`
      );
    },
    stopAsync: async () => {
      clearInterval(timer);
      await sql.close();
      if (samples.length === 0) {
        return ["Where the time went: not measured (Postgres could not be read)."];
      }
      const active = samples.map((sample) => sample.activeConnections);
      const open = samples.map((sample) => sample.openConnections);
      const locks = samples.map((sample) => sample.waitingOnLocks);
      const postgresUse = samples.flatMap((sample) => (sample.postgres === null ? [] : [sample.postgres]));
      const postgresCpu = postgresUse.map((use) => use.cpu);
      const apiCpu = samples.flatMap((sample) => (sample.processes?.get("dealership-api") ?? []).map((use) => use.cpu));

      const lines = [
        "| Part | Processes | CPU, % of a core (average / most) | Memory, MB (most) |",
        "| --- | --- | --- | --- |",
        postgresUse.length > 0
          ? `| Postgres (whole container) | 1 | ${average(postgresCpu).toFixed(0)} / ${most(postgresCpu).toFixed(0)} | ` +
            `${most(postgresUse.map((use) => use.memoryMb)).toFixed(0)} |`
          : "| Postgres (whole container) | 1 | not measured | not measured |",
      ];
      for (const part of PARTS) {
        const uses = samples.flatMap((sample) => sample.processes?.get(part.name) ?? []);
        const count = most(samples.map((sample) => sample.processes?.get(part.name)?.length ?? 0));
        lines.push(
          uses.length > 0
            ? `| ${part.name} | ${count} | ${average(uses.map((use) => use.cpu)).toFixed(0)} / ` +
                `${most(uses.map((use) => use.cpu)).toFixed(0)} each | ${most(uses.map((use) => use.memoryMb)).toFixed(0)} each |`
            : `| ${part.name} | not measured | | |`,
        );
      }
      lines.push(
        "",
        `Postgres: ${average(active).toFixed(1)} queries running on average (at most ${most(active)}) on ` +
          `${average(open).toFixed(0)} open connections; ${most(locks)} at most waiting on a lock.`,
      );

      const connectionsFull = average(open) > 0 && average(active) / average(open) >= BUSY_CONNECTIONS;
      if (connectionsFull) {
        lines.push(
          "Every open connection was busy: requests queued inside the API for a free one, and that wait is in the " +
            "times above. Slow queries hold connections longest; look at the slowest kinds first.",
        );
      }
      const postgresFull = postgresCpu.length > 0 && average(postgresCpu) >= BUSY_POSTGRES_CPU;
      const lockBound = most(locks) > 0 && average(locks) >= 1;
      const apiFull = apiCpu.length > 0 && average(apiCpu) >= BUSY_PROCESS_CPU;
      if (postgresFull || lockBound) {
        lines.push(
          "The limit: the database. More API copies would only queue more queries on it. Look at the slowest kinds " +
            "above with `bun run sql:explain --as <user>` (indexes, row-level security), and at what waits on locks.",
        );
      } else if (connectionsFull) {
        lines.push(
          "The limit: the connections, not the database's CPU. Queries hold them while they wait (locks, disk); more " +
            "connections help only while Postgres has CPU to spare.",
        );
      } else if (apiFull) {
        lines.push(
          "The limit: the API processes, each near a full core. More copies help: DEALERSHIP_API_INSTANCES=<n> bun run start:prod.",
        );
      } else if (postgresCpu.length > 0 && apiCpu.length > 0) {
        lines.push(
          "Neither the database nor the API processes were full: the limit is elsewhere (the gateway, this machine " +
            "running the test as well) or the load was not high enough. Raise --rate.",
        );
      }
      return lines;
    },
  };
}
