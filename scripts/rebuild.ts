// Rebuilds one .NET service from source and restarts it, while the rest of the system keeps running:
//
//   bun run rebuild identity-api
//
// dealership-api and web reload themselves when a file changes; the .NET services (identity-api, document-api,
// gateway-api) keep running the build they started with until they are rebuilt.
const DOTNET_SERVICES = ["identity-api", "document-api", "gateway-api"];

const [service] = process.argv.slice(2);
if (!service || !DOTNET_SERVICES.includes(service)) {
  console.error(`Usage: bun run rebuild <${DOTNET_SERVICES.join("|")}>`);
  process.exit(1);
}

const rebuild = Bun.spawnSync(["aspire", "resource", service, "rebuild", "--non-interactive", "--nologo"], {
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(rebuild.exitCode ?? 1);
