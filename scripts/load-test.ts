// `bun run load-test`: a busy morning against the running system, through the gateway, signed in the way a browser is
// (a session cookie per person), and what it did: response times and failures by kind of request and by location, and
// what each part of the system used (CPU, memory, database connections), live every 5 seconds and in a report.
//
//   bun run load-test                                        100 requests a second from 50 people, for 60 seconds
//   bun run load-test --rate 3300 --people 200 --seconds 120
//   bun run load-test --target-rps 3300 --target-p95 300     sends at 3,300 a second; exits 1 when fewer are answered,
//                                                            p95 is over 300 ms, or more than 1% fail
//   bun run load-test --writes 5                             5% of requests add or edit a customer (they stay)
//   bun run load-test --rate 260 --writes 5 --calm 10        10 s at a tenth of the rate before and after: recovery
//
// A 503 that says the system is busy (`urn:acme:error:busy`, ACME-121) is counted as "busy", apart from failures: it
// is an answer within its wait, which the web tries again.
//
// It sends at a fixed rate, as a busy morning arrives: people do not wait for each other, so a slow answer does not
// slow the next request down, it only waits longer itself. A request's time counts from when it was due, so a test
// that fell behind cannot hide it. The first --warm-up seconds (10) are sent but not counted (cold caches, the runtime
// warming up), and a request that takes longer than --timeout ms (10,000) counts as failed: a person gives up too.
//
// What it sends, out of 100: customer list pages as the web asks for them (ACME-129: page 1, then Next and Previous by
// their cursors, the last page, now and then a jump by number), searches
// (a surname, a misspelt one, part of a phone number), filters and sorts, one customer, recent customers, the parts
// list, its count, one part, the stock value and who am I; with --writes, that share adds or edits a customer. The people are
// spread over the locations as a busy morning is (Northside the busiest): see LOCATION_SHARES.
//
// Load the real sizes first (`bun run seed:bulk`): a slow query only shows at Northside's 1.6 million customers.
// Without --writes it only reads, so it can run again and again on the same data; with it, start clean with
// `bun run reset && bun run seed:bulk` before comparing runs. Measure `bun run start:prod --load-test` (built code,
// Release, quiet logs, the limits per address lifted: from one machine every person shares one address), not
// `bun run dev`, and compare runs on the same machine: a laptop's numbers say before against after, not what
// production will do. Each person keeps their share at the gateway (RateLimit:RequestsPerSecond, 20 a second): a 429
// means one person asked for more than a person would; add people rather than raising it.
import { type LoadWatch, watchLoad } from "./load-watch";
import { DEMO_PASSWORD, DEMO_USERS, type Location, resourceUrl } from "./running-system";

interface Options {
  people: number;
  rate: number;
  seconds: number;
  warmUp: number;
  /** Seconds at a tenth of the rate before and after the rush, each timed on its own: does it recover? (ACME-121) */
  calm: number;
  timeoutMs: number;
  writes: number;
  targetRps: number | null;
  targetP95: number | null;
}

/** A customer seen at a location, to search for and open. */
interface KnownCustomer {
  id: string;
  surname: string;
  phone: string | null;
  city: string | null;
}

/**
 * What the test knows about a location before it starts: some of its customers and parts, its last page by number, and
 * cursors from pages through its list, for Next and Previous (ACME-129).
 */
interface Place {
  location: Location;
  customers: KnownCustomer[];
  partIds: string[];
  lastPage: number;
  cursors: string[];
}

interface Person {
  user: string;
  cookie: string;
  place: Place;
  /** The customers this person added (--writes), with the version each was last saved at. */
  added: { id: string; version: number }[];
}

interface Call {
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
  ifMatch?: string;
  /** What to remember from a good answer (a write's new version). */
  remember?: (answer: unknown) => void;
}

interface Kind {
  name: string;
  weight: number;
  call: (person: Person) => Call;
}

/** The parts of a run: a calm phase before and after the rush (`--calm`), the warm-up, the rush that is counted. */
type Phase = "calm before" | "warm-up" | "rush" | "calm after";

interface Tally {
  times: number[];
  statuses: Map<string, number>;
}

const PAGE_HEADER = { "x-requested-with": "acme-web" };
const PAGE_SIZE = 25;
/** Lists stop at row 10,000 (pageOffset): the last page a person can reach. */
const LAST_REACHABLE_PAGE = 10_000 / PAGE_SIZE;
/** A person's share at the gateway (RateLimit:RequestsPerSecond). */
const SHARE_PER_PERSON = 20;

/** How the people are spread over the locations, out of 100. A location nobody can work at is left out. */
const LOCATION_SHARES: Record<string, number> = { Northside: 50, Riverside: 25, Westgate: 15, Central: 10 };

function pick(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low + 1));
}

function oneOf<T>(items: T[]): T | undefined {
  return items[pick(0, items.length - 1)];
}

/** Most people stay on the first pages; some go further, a few to the end. */
function pickPage(lastPage: number): number {
  const roll = Math.random();
  if (roll < 0.6) {
    return pick(1, Math.min(3, lastPage));
  }
  if (roll < 0.9) {
    return pick(1, Math.min(40, lastPage));
  }
  return pick(1, lastPage);
}

/**
 * A customer list page as the web asks for it (ACME-129): page 1 most, then Next and Previous from where people are
 * (cursors), the last page, and now and then a jump by number (offset, up to page 400).
 */
function listPage(place: Place): string {
  const roll = Math.random();
  const cursor = oneOf(place.cursors);
  if (roll < 0.45 || !cursor) {
    return "page=1";
  }
  if (roll < 0.8) {
    return `after=${encodeURIComponent(cursor)}`;
  }
  if (roll < 0.88) {
    return `before=${encodeURIComponent(cursor)}`;
  }
  if (roll < 0.95) {
    return "last=true";
  }
  return `page=${pickPage(place.lastPage)}`;
}

/** A surname with its middle letter left out ("Penwood" → "Penwod"), as a person mistypes it. */
function misspelt(surname: string): string {
  const middle = Math.floor(surname.length / 2);
  return surname.length < 5 ? surname : surname.slice(0, middle) + surname.slice(middle + 1);
}

function customers(query: string): string {
  return `/api/dealership/v1/customers?pageSize=${PAGE_SIZE}&${query}`;
}

function someCustomer(person: Person): KnownCustomer | undefined {
  return oneOf(person.place.customers);
}

/** What people do on a busy morning, and how often, out of 100. */
/** Parts searches as the counter types them, over the large sample data's catalogue (ACME-123). */
const PARTS_SEARCHES = [
  "brake pads front",
  "pads brake rear",
  "brak pads",
  "oil filter",
  "filters",
  "cabin filter carbon",
  "wiper blade rear",
  "spark plug iridium",
  "timing belt kit",
  "shock absorber front golf",
  "battery 12 v 95",
  "clutch kit focus",
  "headlamp bulb h7",
  "water pump",
  "BRK-PAD-20",
  "FLT-OIL",
];

const READS: Kind[] = [
  {
    name: "customers list",
    weight: 30,
    call: (person) => ({ method: "GET", path: customers(listPage(person.place)) }),
  },
  {
    // A list view asks its total once (ACME-117): the plain list, or a filter (a search's page counts for itself).
    name: "customers count",
    weight: 8,
    call: (person) => {
      const city = someCustomer(person)?.city;
      return {
        method: "GET",
        path:
          Math.random() < 0.6 || !city
            ? "/api/dealership/v1/customers/count"
            : `/api/dealership/v1/customers/count?filterField=city&filterOperator=equals&filterValue=${encodeURIComponent(city)}`,
      };
    },
  },
  {
    name: "customer search",
    weight: 15,
    call: (person) => {
      const customer = someCustomer(person);
      const roll = Math.random();
      const digits = customer?.phone?.replace(/\D/g, "") ?? "";
      const text =
        roll < 0.2 && digits.length >= 6
          ? digits.slice(-6)
          : roll < 0.4
            ? misspelt(customer?.surname ?? "Smith")
            : (customer?.surname ?? "Smith");
      return { method: "GET", path: customers(`page=1&search=${encodeURIComponent(text)}`) };
    },
  },
  {
    name: "customers filtered or sorted",
    weight: 10,
    call: (person) => {
      const roll = Math.random();
      const city = someCustomer(person)?.city;
      const query =
        roll < 0.4
          ? "page=1&sort=lastContactDate&direction=desc"
          : roll < 0.7
            ? "page=1&filterField=status&filterOperator=is&filterValue=active"
            : city
              ? `page=1&filterField=city&filterOperator=equals&filterValue=${encodeURIComponent(city)}`
              : "page=1&sort=city";
      return { method: "GET", path: customers(query) };
    },
  },
  {
    name: "one customer",
    weight: 10,
    call: (person) => {
      const customer = someCustomer(person);
      return { method: "GET", path: customer ? `/api/dealership/v1/customers/${customer.id}` : customers("page=1") };
    },
  },
  { name: "recent customers", weight: 5, call: () => ({ method: "GET", path: "/api/dealership/v1/customers/recent" }) },
  {
    name: "parts list",
    weight: 5,
    call: () => ({ method: "GET", path: `/api/dealership/v1/parts?page=${pick(1, 3)}&pageSize=${PAGE_SIZE}` }),
  },
  {
    // What a parts counter types (ACME-123): words in any order and form, a word cut short, a part number's beginning.
    name: "parts search",
    weight: 4,
    call: () => ({
      method: "GET",
      path: `/api/dealership/v1/parts?page=1&pageSize=${PAGE_SIZE}&search=${encodeURIComponent(oneOf(PARTS_SEARCHES) ?? "brake")}`,
    }),
  },
  {
    // The parts list asks its total once per question (ACME-124): the plain list, or a search.
    name: "parts count",
    weight: 2,
    call: () => ({
      method: "GET",
      path:
        Math.random() < 0.5
          ? "/api/dealership/v1/parts/count"
          : `/api/dealership/v1/parts/count?search=${encodeURIComponent(oneOf(PARTS_SEARCHES) ?? "brake")}`,
    }),
  },
  {
    name: "one part",
    weight: 6,
    call: (person) => {
      const partId = oneOf(person.place.partIds);
      return {
        method: "GET",
        path: partId ? `/api/dealership/v1/parts/${partId}` : "/api/dealership/v1/parts?page=1&pageSize=25",
      };
    },
  },
  { name: "stock value", weight: 4, call: () => ({ method: "GET", path: "/api/dealership/v1/parts/stock-value" }) },
  { name: "who am I", weight: 3, call: () => ({ method: "GET", path: "/api/identity/v1/users/me" }) },
];

function customerBody(lastContactDate: string | null): unknown {
  return {
    firstName: `Load${pick(1000, 9999)}`,
    surname: "Loadtest",
    companyName: null,
    email: null,
    phone: null,
    city: null,
    status: "prospect",
    lastContactDate,
  };
}

function addCustomer(person: Person): Call {
  return {
    method: "POST",
    path: "/api/dealership/v1/customers",
    body: customerBody(null),
    remember: (answer) => {
      const saved = answer as { id?: string; version?: number };
      if (saved.id && typeof saved.version === "number") {
        person.added.push({ id: saved.id, version: saved.version });
      }
    },
  };
}

/** With --writes: adding a customer, and editing one this person added (never the sample data's). */
const WRITES: Kind[] = [
  { name: "add customer", weight: 70, call: addCustomer },
  {
    name: "edit customer",
    weight: 30,
    call: (person) => {
      const customer = oneOf(person.added);
      if (!customer) {
        return addCustomer(person);
      }
      return {
        method: "PUT",
        path: `/api/dealership/v1/customers/${customer.id}`,
        body: customerBody(new Date().toISOString().slice(0, 10)),
        ifMatch: `"${customer.version}"`,
        remember: (answer) => {
          const saved = answer as { version?: number };
          if (typeof saved.version === "number") {
            customer.version = saved.version;
          }
        },
      };
    },
  },
];

const USAGE =
  "Usage: bun run load-test [--rate N] [--people N] [--seconds N] [--warm-up N] [--calm N] [--timeout ms] [--writes %] " +
  "[--target-rps N] [--target-p95 ms]";

function parseOptions(argv: string[]): Options {
  const options: Options = {
    people: 50,
    rate: 0,
    seconds: 60,
    warmUp: 10,
    calm: 0,
    timeoutMs: 10_000,
    writes: 0,
    targetRps: null,
    targetP95: null,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] ?? "";
    const value = Number(argv[index + 1]);
    if (flag === "--in-flight") {
      console.error(`--in-flight is gone: the test now sends at a fixed rate (--rate N a second). ${USAGE}`);
      process.exit(1);
    }
    const allowsZero = flag === "--warm-up" || flag === "--writes" || flag === "--calm";
    if (!Number.isFinite(value) || value < 0 || (value === 0 && !allowsZero)) {
      console.error(`${flag} takes a ${allowsZero ? "" : "positive "}number. ${USAGE}`);
      process.exit(1);
    }
    switch (flag) {
      case "--people":
        options.people = value;
        break;
      case "--rate":
        options.rate = value;
        break;
      case "--seconds":
        options.seconds = value;
        break;
      case "--warm-up":
        options.warmUp = value;
        break;
      case "--calm":
        options.calm = value;
        break;
      case "--timeout":
        options.timeoutMs = value;
        break;
      case "--writes":
        options.writes = Math.min(100, value);
        break;
      case "--target-rps":
        options.targetRps = value;
        break;
      case "--target-p95":
        options.targetP95 = value;
        break;
      default:
        console.error(`Unknown option ${flag}. ${USAGE}`);
        process.exit(1);
    }
  }
  // Sending at the target is what the target asks: 3,300 a second arriving, answered in time.
  options.rate = options.rate || options.targetRps || 100;
  return options;
}

/** Signs in as the web app does (a session cookie) and returns the cookie and where the user may work. */
async function signInAsync(gateway: string, user: string): Promise<{ cookie: string; locations: Location[] }> {
  const response = await fetch(`${gateway}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json", ...PAGE_HEADER },
    body: JSON.stringify({ email: DEMO_USERS[user], password: DEMO_PASSWORD }),
  });
  const cookie = response.headers
    .getSetCookie()
    .find((header) => header.startsWith("acme_session="))
    ?.split(";")[0];
  if (response.status === 429) {
    throw new Error(
      "Signing in was refused (429): identity allows 10 sign-ins a minute from one address. " +
        "Start the system with `bun run start:prod --load-test`, then run the load test again.",
    );
  }
  if (!response.ok || !cookie) {
    throw new Error(`Signing in as ${user} failed: ${response.status} ${await response.text()}`);
  }
  const me = (await (
    await fetch(`${gateway}/api/identity/v1/users/me`, { headers: { cookie, ...PAGE_HEADER } })
  ).json()) as { locations: Location[] };
  return { cookie, locations: me.locations };
}

async function getJsonAsync<T>(gateway: string, cookie: string, location: Location, path: string): Promise<T> {
  const response = await fetch(`${gateway}${path}`, {
    headers: { cookie, "x-location-id": location.id, ...PAGE_HEADER },
  });
  if (!response.ok) {
    throw new Error(`Reading ${path} at ${location.name} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/** Some of a location's customers (from the first, a middle and the last page) and parts, and its last page. */
async function placeAsync(gateway: string, cookie: string, location: Location): Promise<Place> {
  type Page = { items?: KnownCustomer[]; next?: string | null; previous?: string | null };
  const first = await getJsonAsync<Page>(gateway, cookie, location, customers("page=1"));
  // The total is the count endpoint's (ACME-117): exact, about or many (ACME-129).
  const counted = await getJsonAsync<{ kind?: string; value?: number | null }>(
    gateway,
    cookie,
    location,
    "/api/dealership/v1/customers/count",
  );
  if (!counted.kind) {
    throw new Error(`The customer count at ${location.name} gave no total.`);
  }
  const total = typeof counted.value === "number" ? counted.value : LAST_REACHABLE_PAGE * PAGE_SIZE;
  const lastPage = Math.max(1, Math.min(LAST_REACHABLE_PAGE, Math.ceil(total / PAGE_SIZE)));
  const later = await Promise.all([
    ...[...new Set([Math.ceil(lastPage / 2), pick(1, lastPage), lastPage])]
      .filter((page) => page > 1)
      .map((page) => getJsonAsync<Page>(gateway, cookie, location, customers(`page=${page}`))),
    getJsonAsync<Page>(gateway, cookie, location, customers("last=true")),
  ]);
  const parts = await getJsonAsync<{ items?: { id: string }[] }>(
    gateway,
    cookie,
    location,
    `/api/dealership/v1/parts?page=1&pageSize=${PAGE_SIZE}`,
  );
  return {
    location,
    customers: [first, ...later].flatMap((page) =>
      (page.items ?? []).map((item) => ({ id: item.id, surname: item.surname, phone: item.phone, city: item.city })),
    ),
    partIds: (parts.items ?? []).map((part) => part.id),
    lastPage,
    // Where people are in the list: after page 1, in the middle, past row 10,000 by Next, near the end.
    cursors: [first, ...later].flatMap((page) =>
      [page.next, page.previous].filter((cursor) => typeof cursor === "string"),
    ),
  };
}

/** How many of `people` work at each location, by LOCATION_SHARES among the locations someone can work at. */
function spread(people: number, names: string[]): Map<string, number> {
  const shares = names.map((name) => LOCATION_SHARES[name] ?? 0);
  const whole = shares.reduce((sum, share) => sum + share, 0);
  const weights = whole > 0 ? shares : names.map(() => 1);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const counts = weights.map((weight) => Math.floor((people * weight) / weightSum));
  for (let left = people - counts.reduce((sum, count) => sum + count, 0), index = 0; left > 0; left -= 1, index += 1) {
    const at = index % counts.length;
    counts[at] = (counts[at] ?? 0) + 1;
  }
  return new Map(names.map((name, index) => [name, counts[index] ?? 0]));
}

async function peopleAsync(gateway: string, count: number): Promise<Person[]> {
  // Who may work where: one sign-in per demo user.
  const users = Object.keys(DEMO_USERS);
  const access = await Promise.all(users.map(async (user) => ({ user, ...(await signInAsync(gateway, user)) })));
  const locations = new Map<string, Location>();
  for (const { locations: theirs } of access) {
    for (const location of theirs) {
      locations.set(location.name, location);
    }
  }
  const counts = spread(count, [...locations.keys()]);

  const people: Person[] = [];
  for (const [name, howMany] of counts) {
    const location = locations.get(name);
    const workers = access.filter((entry) => entry.locations.some((candidate) => candidate.name === name));
    const firstWorker = workers[0];
    if (!location || !firstWorker || howMany === 0) {
      continue;
    }
    const place = await placeAsync(gateway, firstWorker.cookie, location);
    for (let index = 0; index < howMany; index += 1) {
      // A session of their own each, as every person at the desk has their own browser.
      const user = workers[index % workers.length]?.user ?? firstWorker.user;
      const { cookie } = await signInAsync(gateway, user);
      people.push({ user, cookie, place, added: [] });
    }
  }
  return people;
}

function percentile(sorted: number[], fraction: number): number {
  return sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0);
}

function tallyOf(tallies: Map<string, Tally>, name: string): Tally {
  const existing = tallies.get(name);
  if (existing) {
    return existing;
  }
  const created: Tally = { times: [], statuses: new Map() };
  tallies.set(name, created);
  return created;
}

/**
 * What a status says: "busy" for a 503 that is the system saying so (`urn:acme:error:busy`, ACME-121: an answer within
 * its wait, worth trying again), apart from failures; any other status as its number.
 */
export function classify(status: number, body: string): string {
  if (status === 503) {
    try {
      if ((JSON.parse(body) as { type?: unknown }).type === "urn:acme:error:busy") {
        return "busy";
      }
    } catch {
      // Not a problem document: an ordinary 503.
    }
  }
  return String(status);
}

function failures(tally: Tally): number {
  return [...tally.statuses]
    .filter(([status]) => !status.startsWith("2") && status !== "busy")
    .reduce((sum, [, count]) => sum + count, 0);
}

function busy(tally: Tally): number {
  return tally.statuses.get("busy") ?? 0;
}

function row(name: string, tally: Tally): string {
  const sorted = tally.times.toSorted((a, b) => a - b);
  const times = [0.5, 0.95, 0.99].map((fraction) => percentile(sorted, fraction).toFixed(0));
  return `| ${name} | ${sorted.length} | ${failures(tally)} | ${times.join(" | ")} | ${(sorted.at(-1) ?? 0).toFixed(0)} |`;
}

/**
 * How many requests the test has open at once (`BUN_CONFIG_MAX_HTTP_REQUESTS`, which `bun run load-test` sets; Bun's own
 * default is 256): as many connections as a load balancer in front of the gateway would keep, reused. Past that the
 * test queues its own requests, and the wait counts as the system's, as a person's would. At 8,192 it opened thousands
 * of connections at once when the system fell behind; on macOS that overflowed the listen queue (128) and a .NET bug
 * took the gateway down (ACME-129). At 256, 300 a second showed 7 s where the services took 1.
 */
const CLIENT_MAX_REQUESTS = 512;

async function main(): Promise<void> {
  if (Number(process.env.BUN_CONFIG_MAX_HTTP_REQUESTS ?? 256) < CLIENT_MAX_REQUESTS) {
    console.warn(
      `Bun sends at most ${process.env.BUN_CONFIG_MAX_HTTP_REQUESTS ?? 256} requests at once: run it as \`bun run load-test\`, ` +
        `which sets BUN_CONFIG_MAX_HTTP_REQUESTS=${CLIENT_MAX_REQUESTS}, or the times include the test's own queue.`,
    );
  }
  const options = parseOptions(process.argv.slice(2));
  const gateway = resourceUrl("gateway-api", "http");
  // Now, not when watching starts: the lookup blocks while it asks the Aspire CLI, and the test would fall behind.
  const postgresUrl = resourceUrl("postgres", "tcp");
  console.log(`Signing in ${options.people} people at ${gateway} …`);
  const people = await peopleAsync(gateway, options.people);
  const atEach = new Map<string, number>();
  for (const person of people) {
    atEach.set(person.place.location.name, (atEach.get(person.place.location.name) ?? 0) + 1);
  }
  console.log(`People: ${[...atEach].map(([name, count]) => `${count} at ${name}`).join(", ")}`);
  if (options.rate / people.length > SHARE_PER_PERSON) {
    console.warn(
      `Each person would send ${(options.rate / people.length).toFixed(0)} a second, over their share of ` +
        `${SHARE_PER_PERSON} at the gateway: expect 429s. Add people (--people ${Math.ceil(options.rate / SHARE_PER_PERSON)}).`,
    );
  }

  const reads = READS.flatMap((kind) => Array.from({ length: kind.weight }, () => kind));
  const writes = WRITES.flatMap((kind) => Array.from({ length: kind.weight }, () => kind));
  const byKind = new Map<string, Tally>();
  const byLocation = new Map<string, Tally>();
  const started = performance.now();
  const calmTallies = new Map<Phase, Tally>(
    options.calm > 0
      ? [
          ["calm before", { times: [], statuses: new Map() }],
          ["calm after", { times: [], statuses: new Map() }],
        ]
      : [],
  );
  let phaseNow: Phase = "warm-up";
  const inFlight = new Set<Promise<void>>();
  let sent = 0;
  let answered = 0;
  let mostInFlight = 0;
  let mostBehindMs = 0;
  // Started after the warm-up, so the resources it reports are the counted part's.
  const watching: { watch: LoadWatch | null } = { watch: null };
  const cpuAtStart = process.cpuUsage();

  const sendAsync = async (dueAt: number, phase: Phase): Promise<void> => {
    const person = oneOf(people);
    const kind = options.writes > 0 && Math.random() * 100 < options.writes ? oneOf(writes) : oneOf(reads);
    if (!person || !kind) {
      return;
    }
    const counted = phase === "rush";
    if (counted) {
      mostBehindMs = Math.max(mostBehindMs, performance.now() - dueAt);
    }
    const call = kind.call(person);
    let status: string;
    try {
      const response = await fetch(`${gateway}${call.path}`, {
        method: call.method,
        headers: {
          cookie: person.cookie,
          "x-location-id": person.place.location.id,
          ...PAGE_HEADER,
          ...(call.body === undefined ? {} : { "content-type": "application/json" }),
          ...(call.ifMatch ? { "if-match": call.ifMatch } : {}),
        },
        body: call.body === undefined ? null : JSON.stringify(call.body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      const text = await response.text();
      status = classify(response.status, text);
      if (response.ok && call.remember) {
        call.remember(JSON.parse(text));
      }
    } catch (error) {
      status = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "no answer";
    }
    answered += 1;
    // From when it was due, not when it went: a test that fell behind cannot hide it in the times.
    const time = performance.now() - dueAt;
    const calm = calmTallies.get(phase);
    if (calm) {
      calm.times.push(time);
      calm.statuses.set(status, (calm.statuses.get(status) ?? 0) + 1);
    }
    if (!counted) {
      return;
    }
    for (const tally of [tallyOf(byKind, kind.name), tallyOf(byLocation, person.place.location.name)]) {
      tally.times.push(time);
      tally.statuses.set(status, (tally.statuses.get(status) ?? 0) + 1);
    }
  };

  const ticker = setInterval(() => {
    const elapsed = (performance.now() - started) / 1000;
    const label = phaseNow === "rush" ? "" : ` (${phaseNow}${phaseNow === "warm-up" ? ", not counted" : ""})`;
    const resources = watching.watch?.nowLine() ?? "";
    console.log(
      `  ${elapsed.toFixed(0)} s${label}: ${sent} sent, ${answered} answered, ${inFlight.size} in flight` +
        (resources ? ` | ${resources}` : ""),
    );
  }, 5000);

  // Each phase at its own rate, one after the other; a request's time counts from when it was due.
  const sendPhaseAsync = (phase: Phase, rate: number, seconds: number): Promise<void> =>
    new Promise<void>((resolve) => {
      phaseNow = phase;
      const phaseStarted = performance.now();
      const phaseTotal = Math.floor(rate * seconds);
      let phaseSent = 0;
      const sender = setInterval(() => {
        const due = Math.min(phaseTotal, Math.floor(((performance.now() - phaseStarted) / 1000) * rate));
        while (phaseSent < due) {
          const dueAt = phaseStarted + (phaseSent * 1000) / rate;
          phaseSent += 1;
          sent += 1;
          const request = sendAsync(dueAt, phase).finally(() => inFlight.delete(request));
          inFlight.add(request);
          mostInFlight = Math.max(mostInFlight, inFlight.size);
        }
        if (phaseSent >= phaseTotal) {
          clearInterval(sender);
          resolve();
        }
      }, 5);
    });

  const calmRate = Math.max(1, options.rate / 10);
  if (options.calm > 0) {
    await sendPhaseAsync("calm before", calmRate, options.calm);
  }
  await sendPhaseAsync("warm-up", options.rate, options.warmUp);
  watching.watch = watchLoad(postgresUrl);
  await sendPhaseAsync("rush", options.rate, options.seconds);
  if (options.calm > 0) {
    await sendPhaseAsync("calm after", calmRate, options.calm);
  }
  await Promise.all(inFlight);
  clearInterval(ticker);
  const whereTheTimeWent = (await watching.watch?.stopAsync()) ?? [];
  const cpu = process.cpuUsage(cpuAtStart);
  const wallSeconds = (performance.now() - started) / 1000;

  const all: Tally = { times: [], statuses: new Map() };
  for (const tally of byKind.values()) {
    all.times.push(...tally.times);
    for (const [status, count] of tally.statuses) {
      all.statuses.set(status, (all.statuses.get(status) ?? 0) + count);
    }
  }
  const failed = failures(all);
  const toldBusy = busy(all);
  const answeredInTime = all.times.length - failed - toldBusy;
  const answeredRate = answeredInTime / options.seconds;
  const p95 = percentile(
    all.times.toSorted((a, b) => a - b),
    0.95,
  );

  console.log(
    `\nCounted ${options.seconds} s after a ${options.warmUp} s warm-up: ${all.times.length} requests sent at ` +
      `${options.rate} a second; ${answeredInTime} answered well (${answeredRate.toFixed(0)} a second), ` +
      `${toldBusy} told "busy", ${failed} failed (an error, or no answer within ${options.timeoutMs} ms).`,
  );
  console.log(
    "\n| What | Requests | Failed | p50 ms | p95 ms | p99 ms | max ms |\n| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const [name, tally] of byKind) {
    console.log(row(name, tally));
  }
  console.log(row("all", all));
  const failing = [...byKind].filter(([, tally]) => failures(tally) > 0);
  if (failing.length > 0) {
    console.log("\nFailures by kind:");
    for (const [name, tally] of failing) {
      const statuses = [...tally.statuses].filter(([status]) => !status.startsWith("2"));
      console.log(`  ${name}: ${statuses.map(([status, count]) => `${status} × ${count}`).join(", ")}`);
    }
  }
  if (calmTallies.size > 0) {
    // Does it recover? The same calm rate before and after the rush (ACME-121: within 10 s, as fast as before).
    console.log(
      `\n| Calm, ${calmRate.toFixed(0)} a second | Requests | Failed | p50 ms | p95 ms | p99 ms | max ms |\n` +
        "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const [name, tally] of calmTallies) {
      console.log(row(name, tally));
    }
  }
  console.log(
    "\n| Where | Requests | Failed | p50 ms | p95 ms | p99 ms | max ms |\n| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const [name, tally] of byLocation) {
    console.log(row(name, tally));
  }

  console.log(`\n${whereTheTimeWent.join("\n")}`);
  const ownCpu = ((cpu.user + cpu.system) / 1000 / (wallSeconds * 1000)) * 100;
  console.log(
    `This load test: ${ownCpu.toFixed(0)}% of a core, ${(process.memoryUsage().rss / 1_048_576).toFixed(0)} MB; ` +
      `at most ${mostInFlight} requests in flight; ` +
      (mostBehindMs > 250
        ? `it fell behind by up to ${mostBehindMs.toFixed(0)} ms, so this machine could not send at ${options.rate} a ` +
          "second and the times above include that delay."
        : "it kept to its rate."),
  );
  const added = people.reduce((sum, person) => sum + person.added.length, 0);
  if (added > 0) {
    console.log(
      `It added ${added} customers named "Loadtest"; they stay. Start clean with \`bun run reset && bun run seed:bulk\`.`,
    );
  }

  const misses = [
    options.targetRps !== null && answeredRate < options.targetRps
      ? `${answeredRate.toFixed(0)} a second answered well, under ${options.targetRps}`
      : "",
    options.targetP95 !== null && p95 > options.targetP95 ? `p95 ${p95.toFixed(0)} ms, over ${options.targetP95}` : "",
    failed > all.times.length * 0.01 ? `${failed} of ${all.times.length} failed, over 1%` : "",
  ].filter(Boolean);
  if (misses.length > 0) {
    console.error(`\nMissed: ${misses.join("; ")}.`);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
