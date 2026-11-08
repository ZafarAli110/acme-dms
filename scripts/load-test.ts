// `bun run load-test`: a busy morning against the running system (`bun run dev`), through the gateway, signed in the way
// a browser is (a session cookie per person), and what it did: requests a second, response times, and every status.
//
//   bun run load-test                                  50 people, 200 requests in flight, for 60 seconds
//   bun run load-test --people 200 --in-flight 800 --seconds 120
//   bun run load-test --target-rps 3300 --target-p95 300   exits 1 when either is missed, or more than 1% fail
//
// It only reads (lists, a part, the stock value, recent customers), so it can run on the sample data again and again.
// Load the real sizes first (`bun run seed:bulk`): a slow query only shows at Northside's 1.6 million customers.
// More dealership-api copies: `DEALERSHIP_API_INSTANCES=4 bun run dev`. Each person has a share of requests at the
// gateway (RateLimit:RequestsPerSecond, RateLimit:Burst): a 429 here means one person asked for more than a person
// would; add people rather than raising it.
import { DEMO_PASSWORD, DEMO_USERS, type Location, resourceUrl } from "./running-system";

interface Options {
  people: number;
  inFlight: number;
  seconds: number;
  targetRps: number | null;
  targetP95: number | null;
}

interface Person {
  user: string;
  cookie: string;
  location: Location;
  partIds: string[];
}

interface Kind {
  name: string;
  weight: number;
  path: (person: Person) => string;
}

const PAGE_HEADER = { "x-requested-with": "acme-web" };

/** What people do on a busy morning, and how often, out of 100. */
const KINDS: Kind[] = [
  { name: "customers list", weight: 30, path: () => `/api/dealership/v1/customers?page=${pick(1, 5)}&pageSize=25` },
  { name: "parts list", weight: 25, path: () => `/api/dealership/v1/parts?page=${pick(1, 3)}&pageSize=25` },
  { name: "recent customers", weight: 15, path: () => "/api/dealership/v1/customers/recent" },
  {
    name: "one part",
    weight: 15,
    path: (person) =>
      person.partIds.length > 0
        ? `/api/dealership/v1/parts/${person.partIds[pick(0, person.partIds.length - 1)]}`
        : "/api/dealership/v1/parts?page=1&pageSize=25",
  },
  { name: "stock value", weight: 10, path: () => "/api/dealership/v1/parts/stock-value" },
  { name: "who am I", weight: 5, path: () => "/api/identity/v1/users/me" },
];

function pick(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low + 1));
}

function parseOptions(argv: string[]): Options {
  const options: Options = { people: 50, inFlight: 200, seconds: 60, targetRps: null, targetP95: null };
  const numberAfter = (flag: string, index: number): number => {
    const value = Number(argv[index + 1]);
    if (!Number.isFinite(value) || value <= 0) {
      console.error(`${flag} takes a positive number.`);
      process.exit(1);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] ?? "";
    if (flag === "--people") {
      options.people = numberAfter(flag, index);
    } else if (flag === "--in-flight") {
      options.inFlight = numberAfter(flag, index);
    } else if (flag === "--seconds") {
      options.seconds = numberAfter(flag, index);
    } else if (flag === "--target-rps") {
      options.targetRps = numberAfter(flag, index);
    } else if (flag === "--target-p95") {
      options.targetP95 = numberAfter(flag, index);
    } else {
      console.error(
        `Unknown option ${flag}. Usage: bun run load-test [--people N] [--in-flight N] [--seconds N] [--target-rps N] [--target-p95 ms]`,
      );
      process.exit(1);
    }
  }
  return options;
}

/** Signs in as the web app does: the session cookie, then the person's default location and a few of its parts. */
async function signInAsync(gateway: string, user: string): Promise<Person> {
  const response = await fetch(`${gateway}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json", ...PAGE_HEADER },
    body: JSON.stringify({ email: DEMO_USERS[user], password: DEMO_PASSWORD }),
  });
  const cookie = response.headers
    .getSetCookie()
    .find((header) => header.startsWith("acme_session="))
    ?.split(";")[0];
  if (!response.ok || !cookie) {
    throw new Error(`Signing in as ${user} failed: ${response.status} ${await response.text()}`);
  }
  const me = (await (
    await fetch(`${gateway}/api/identity/v1/users/me`, { headers: { cookie, ...PAGE_HEADER } })
  ).json()) as { locations: Location[]; defaultLocationId: string | null };
  const location = me.locations.find((candidate) => candidate.id === me.defaultLocationId) ?? me.locations[0];
  if (!location) {
    throw new Error(`${user} has no location.`);
  }
  const parts = (await (
    await fetch(`${gateway}/api/dealership/v1/parts?page=1&pageSize=25`, {
      headers: { cookie, "x-location-id": location.id, ...PAGE_HEADER },
    })
  ).json()) as { items?: { id: string }[] };
  return { user, cookie, location, partIds: (parts.items ?? []).map((part) => part.id) };
}

function percentile(sorted: number[], fraction: number): number {
  return sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const gateway = resourceUrl("gateway-api", "http");
  const users = Object.keys(DEMO_USERS);
  console.log(`Signing in ${options.people} people at ${gateway} …`);
  const people: Person[] = [];
  for (let index = 0; index < options.people; index += 1) {
    people.push(await signInAsync(gateway, users[index % users.length] ?? "maria"));
  }

  const weighted = KINDS.flatMap((kind) => Array.from({ length: kind.weight }, () => kind));
  const times = new Map<string, number[]>(KINDS.map((kind) => [kind.name, []]));
  const statuses = new Map<string, number>();
  let done = 0;
  const started = performance.now();
  const deadline = started + options.seconds * 1000;

  const ticker = setInterval(() => {
    const elapsed = (performance.now() - started) / 1000;
    console.log(`  ${elapsed.toFixed(0)} s: ${done} requests, ${(done / elapsed).toFixed(0)} a second`);
  }, 5000);

  // Each loop is one request in flight at a time, for a person picked at random: the requests interleave as a busy
  // morning's do.
  const loopAsync = async (): Promise<void> => {
    while (performance.now() < deadline) {
      const person = people[pick(0, people.length - 1)];
      const kind = weighted[pick(0, weighted.length - 1)];
      if (!person || !kind) {
        return;
      }
      const sent = performance.now();
      let status: string;
      try {
        const response = await fetch(`${gateway}${kind.path(person)}`, {
          headers: { cookie: person.cookie, "x-location-id": person.location.id, ...PAGE_HEADER },
        });
        await response.arrayBuffer();
        status = String(response.status);
      } catch (error) {
        status = error instanceof Error ? error.name : "error";
      }
      times.get(kind.name)?.push(performance.now() - sent);
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
      done += 1;
    }
  };
  await Promise.all(Array.from({ length: options.inFlight }, loopAsync));
  clearInterval(ticker);

  const seconds = (performance.now() - started) / 1000;
  const all = [...times.values()].flat().toSorted((a, b) => a - b);
  const rps = done / seconds;
  const p95 = percentile(all, 0.95);
  const failed = [...statuses].filter(([status]) => !status.startsWith("2")).reduce((sum, [, count]) => sum + count, 0);

  console.log(
    `\n${done} requests in ${seconds.toFixed(1)} s: ${rps.toFixed(0)} a second, ${options.inFlight} in flight`,
  );
  console.log(`Statuses: ${[...statuses].map(([status, count]) => `${status} × ${count}`).join(", ")}`);
  console.log("\n| What | Requests | p50 ms | p95 ms | p99 ms | max ms |\n| --- | --- | --- | --- | --- | --- |");
  for (const [name, measured] of [...times, ["all", all] as const]) {
    const sorted = measured.toSorted((a, b) => a - b);
    const row = [0.5, 0.95, 0.99].map((fraction) => percentile(sorted, fraction).toFixed(0));
    console.log(`| ${name} | ${sorted.length} | ${row.join(" | ")} | ${(sorted.at(-1) ?? 0).toFixed(0)} |`);
  }

  const misses = [
    options.targetRps !== null && rps < options.targetRps
      ? `${rps.toFixed(0)} a second, under ${options.targetRps}`
      : "",
    options.targetP95 !== null && p95 > options.targetP95 ? `p95 ${p95.toFixed(0)} ms, over ${options.targetP95}` : "",
    failed > done * 0.01 ? `${failed} of ${done} failed, over 1%` : "",
  ].filter(Boolean);
  if (misses.length > 0) {
    console.error(`\nMissed: ${misses.join("; ")}.`);
    process.exit(1);
  }
}

await main();
