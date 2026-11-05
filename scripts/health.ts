// `bun run health`: which resource is not healthy, and why. For each one, the last lines of its console output (the
// same as the dashboard's Console logs page), and the fix for a cause we know.

const LOG_LINES = 40;

type Resource = { displayName: string; resourceType: string; state?: string; healthStatus?: string };

const KNOWN_CAUSES: { pattern: RegExp; fix: string }[] = [
  {
    pattern: /already exists/,
    fix:
      "The database has tables another branch's migrations made. Run `bun run reset`: it rebuilds the database " +
      "from this branch.",
  },
  {
    pattern: /password authentication failed/,
    fix: "An old Postgres volume has another password: see Troubleshooting in the README.",
  },
  {
    pattern: /EADDRINUSE|address already in use/,
    fix: "Another `bun run dev` is still running: `bun run stop`, or close the other terminal.",
  },
];

function aspire(args: string[]): string {
  try {
    return Bun.spawnSync(["aspire", ...args, "--nologo"], { stderr: "ignore" }).stdout.toString();
  } catch {
    console.error('The Aspire CLI (`aspire`) is not on your PATH. See "Troubleshooting" in the README.');
    process.exit(1);
  }
}

function isUnwell(resource: Resource): boolean {
  if (resource.resourceType === "Parameter") {
    return false;
  }
  if (resource.state === "Finished") {
    return false;
  }
  return resource.state !== "Running" || (resource.healthStatus ?? "Healthy") !== "Healthy";
}

let resources: Resource[] = [];
try {
  resources = (JSON.parse(aspire(["describe", "--format", "Json"])) as { resources?: Resource[] }).resources ?? [];
} catch {
  // Not JSON: no running AppHost.
}
if (resources.length === 0) {
  console.log("Nothing is running. Start it with `bun run dev`, and wait until every resource is Healthy.");
  process.exit(1);
}

const unwell = resources.filter(isUnwell);
if (unwell.length === 0) {
  console.log(`All ${resources.length} resources are running and healthy.`);
  process.exit(0);
}

for (const resource of unwell) {
  const state = [resource.state ?? "no state", resource.healthStatus].filter(Boolean).join(", ");
  console.log(`\n== ${resource.displayName}: ${state}`);
  const logs = aspire(["logs", resource.displayName, "--tail", String(LOG_LINES)]).trimEnd();
  console.log(logs || "(no console output yet: it may still be waiting for a resource it depends on)");
  for (const cause of KNOWN_CAUSES) {
    if (cause.pattern.test(logs)) {
      console.log(`\nLikely fix: ${cause.fix}`);
    }
  }
}
console.log(
  `\nA resource that is "Waiting" starts once the ones it depends on are healthy: fix those first. ` +
    "After a fix, restart the resource from the dashboard, or stop and run `bun run dev` again.",
);
process.exit(1);
