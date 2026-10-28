// How the helper scripts reach the system started by `bun run dev`: resource URLs come from `aspire describe`,
// and demo users sign in through the gateway exactly like the web app.

export const DEMO_PASSWORD = 'Acme123!';
export const DEMO_USERS: Record<string, string> = {
  alice: 'alice@northwind.test',
  maria: 'maria@northwind.test',
  sam: 'sam@northwind.test',
  tom: 'tom@northwind.test',
  bob: 'bob@northwind.test',
};

export interface Location {
  id: string;
  code: string;
  name: string;
  role: string;
}

export interface Session {
  user: string;
  token: string;
  locations: Location[];
}

type Described = {resources?: {displayName: string; urls?: {name: string; url: string}[]}[]};

/** The URL of a running resource, e.g. resourceUrl('gateway', 'http'). Exits with a hint when nothing is running. */
export function resourceUrl(resource: string, endpoint: string): string {
  let output = '';
  try {
    output = Bun.spawnSync(['aspire', 'describe', resource, '--format', 'Json', '--nologo'], {
      stderr: 'ignore',
    }).stdout.toString();
  } catch {
    console.error(
      'The Aspire CLI (`aspire`) is not on your PATH. See "Prerequisites" and "Troubleshooting" in the README.',
    );
    process.exit(1);
  }
  let described: Described = {};
  try {
    described = JSON.parse(output) as Described;
  } catch {
    // Not JSON: no running AppHost.
  }
  const url = described.resources
    ?.find((candidate) => candidate.displayName === resource)
    ?.urls?.find((candidate) => candidate.name === endpoint)?.url;
  if (!url) {
    console.error(`Could not find ${resource} (${endpoint}). Is \`bun run dev\` running?`);
    process.exit(1);
  }
  return url;
}

export async function signInAsync(gateway: string, user: string): Promise<Session> {
  const email = DEMO_USERS[user];
  if (!email) {
    throw new Error(`Unknown demo user "${user}". Known: ${Object.keys(DEMO_USERS).join(', ')}`);
  }
  const tokenResponse = await fetch(`${gateway}/api/identity/v1/tokens`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({email, password: DEMO_PASSWORD}),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Sign-in as ${user} failed: ${tokenResponse.status} ${await tokenResponse.text()}`);
  }
  const {accessToken} = (await tokenResponse.json()) as {accessToken: string};
  const me = (await (
    await fetch(`${gateway}/api/identity/v1/users/me`, {headers: {authorization: `Bearer ${accessToken}`}})
  ).json()) as {locations: Location[]};
  return {user, token: accessToken, locations: me.locations};
}

/** Calls the gateway as a signed-in user at one of their locations. */
export function callAsync(
  gateway: string,
  session: Session,
  location: Location,
  method: string,
  path: string,
  body?: BodyInit,
  json = true,
): Promise<Response> {
  return fetch(`${gateway}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${session.token}`,
      'x-location-id': location.id,
      ...(json && body ? {'content-type': 'application/json'} : {}),
    },
    body,
  });
}
