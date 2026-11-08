// Acme DMS local environment. `aspire run` starts everything below and prints the dashboard URL.
var builder = DistributedApplication.CreateBuilder(args);

// Development-only credentials, deliberately simple and fixed so people and tools can connect (see README).
var username = builder.AddParameter("dev-username", "acme");
var password = builder.AddParameter("dev-password", "acme", secret: true);

// Infrastructure (containers)
// Room for every instance's pool: each dealership-api holds up to DATABASE_MAX_CONNECTIONS (10), and the .NET services
// their own. Postgres allows 100 by default.
var postgres = builder.AddPostgres("postgres", username, password)
    .WithDataVolume()
    .WithArgs("-c", "max_connections=300");
var identityDb = postgres.AddDatabase("identity");
var dealershipDb = postgres.AddDatabase("dealership");
var documentsDb = postgres.AddDatabase("documents");
// The gateway's own: the browsers' sign-ins (the gateway is the web app's backend, see docs/ARCHITECTURE.md).
var gatewayDb = postgres.AddDatabase("gateway");

var rabbitmq = builder.AddRabbitMQ("rabbitmq", username, password).WithManagementPlugin();

// Services
var identityApi = builder.AddProject<Projects.Acme_Identity_Service>("identity-api")
    .WithHttpHealthCheck("/v1/system/health")
    .WithReference(identityDb)
    .WaitFor(identityDb);

var documentApi = builder.AddProject<Projects.Acme_Documents_Service>("document-api")
    .WithHttpHealthCheck("/v1/system/health")
    .WithReference(documentsDb)
    .WithReference(rabbitmq)
    .WithReference(identityApi)
    .WaitFor(documentsDb)
    .WaitFor(rabbitmq)
    .WaitFor(identityApi);

// The Bun apps run as plain executables: `bun install` at the repo root already installs every workspace.
var dealershipApi = builder.AddExecutable("dealership-api", "bun", "../../backend/dealership-api", "run", "dev")
    .WithHttpEndpoint(env: "PORT")
    .WithHttpHealthCheck("/v1/system/health")
    .WithOtlpExporter()
    .WithReference(dealershipDb)
    .WithReference(rabbitmq)
    .WithReference(identityApi)
    .WithReference(documentApi)
    .WaitFor(dealershipDb)
    .WaitFor(rabbitmq)
    .WaitFor(identityApi)
    .WaitFor(documentApi);

// More copies of dealership-api for more load (DEALERSHIP_API_INSTANCES=4 bun run dev; one by default). The service keeps
// nothing between requests, so any copy can answer any request: Node runs JavaScript on one core per process, and more
// processes use the other cores (and, in production, other machines). The copies run the bundle the first one builds
// and restart on its rebuilds; they wait for it, so the database is migrated before they start (the migration lock
// makes even a race safe). The gateway spreads requests across all of them.
var instances = int.TryParse(builder.Configuration["DEALERSHIP_API_INSTANCES"], out var wanted) ? Math.Max(1, wanted) : 1;
var dealershipApiReplicas = Enumerable.Range(2, instances - 1)
    .Select(number => builder.AddExecutable($"dealership-api-{number}", "bun", "../../backend/dealership-api", "run", "dev", "replica")
        .WithHttpEndpoint(env: "PORT")
        .WithHttpHealthCheck("/v1/system/health")
        .WithOtlpExporter()
        .WithReference(dealershipDb)
        .WithReference(rabbitmq)
        .WithReference(identityApi)
        .WithReference(documentApi)
        .WaitFor(dealershipApi))
    .ToList();

// Runs the exports dealership-api queues (the export_jobs table): a process of its own, so a big export never slows the
// API down. It waits for the API, which applies the database migrations when it starts and builds the bundle this runs
// (dist/worker.js). Both use the same EXPORT_DIR default (the temp folder of this machine): the worker writes a file,
// the API serves it.
builder.AddExecutable("export-worker", "bun", "../../backend/dealership-api", "run", "worker")
    .WithOtlpExporter()
    .WithReference(dealershipDb)
    .WaitFor(dealershipApi);

// The single entry point for the web app: /api/<service>/... is routed to that service with the prefix removed.
var gateway = builder.AddProject<Projects.Acme_Gateway_Service>("gateway-api")
    .WithHttpHealthCheck("/v1/system/health")
    .WithReference(identityApi)
    .WithReference(dealershipApi.GetEndpoint("http"))
    .WithReference(documentApi)
    .WithReference(gatewayDb)
    .WaitFor(gatewayDb)
    .WaitFor(identityApi)
    .WaitFor(dealershipApi)
    .WaitFor(documentApi);
// Every further copy under the same service name: service discovery gives the gateway's proxy one destination each.
for (var index = 0; index < dealershipApiReplicas.Count; index++)
{
    gateway.WithEnvironment($"services__dealership-api__http__{index + 1}", dealershipApiReplicas[index].GetEndpoint("http"));
}

// The sample data (scripts/seed.ts), loaded through the gateway once everything is up. It runs on every start and is
// safe to: it reuses what is already there. `bun run seed` runs the same script by hand.
builder.AddExecutable("seed", "bun", "../..", "scripts/seed.ts")
    .WithReference(gateway)
    .WaitFor(gateway);

builder.AddExecutable("web", "bun", "../../web", "run", "dev")
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints()
    .WithReference(gateway)
    .WaitFor(gateway);

await builder.Build().RunAsync();
