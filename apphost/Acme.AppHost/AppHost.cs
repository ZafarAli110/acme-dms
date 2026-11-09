// Acme DMS local environment. `aspire run` starts everything below and prints the dashboard URL.
var builder = DistributedApplication.CreateBuilder(args);

// Development-only credentials, deliberately simple and fixed so people and tools can connect (see README).
var username = builder.AddParameter("dev-username", "acme");
var password = builder.AddParameter("dev-password", "acme", secret: true);

// Infrastructure (containers)
// Room for every instance's pool: each dealership-api holds up to DATABASE_MAX_CONNECTIONS (5) plus 2 control connections, and the .NET services
// their own. Postgres allows 100 by default.
// pg_stat_statements: Postgres's own record of which statements took its time (`bun run sql:top`). Loaded at start, so
// it is an argument here; managed Postgres (Azure, RDS, Cloud SQL) offers the same extension.
var postgres = builder.AddPostgres("postgres", username, password)
    .WithDataVolume()
    .WithArgs("-c", "max_connections=300")
    .WithArgs("-c", "shared_preload_libraries=pg_stat_statements")
    .WithArgs("-c", "pg_stat_statements.track=top");
var identityDb = postgres.AddDatabase("identity");
var dealershipDb = postgres.AddDatabase("dealership");
var documentsDb = postgres.AddDatabase("documents");
// The gateway's own: the browsers' sign-ins (the gateway is the web app's backend, see docs/ARCHITECTURE.md).
var gatewayDb = postgres.AddDatabase("gateway");

var rabbitmq = builder.AddRabbitMQ("rabbitmq", username, password).WithManagementPlugin();

// `bun run start:prod` (scripts/start-production-like.ts): the same system run as production runs it, to measure it.
// The Bun apps run their built bundle once instead of watching and rebuilding, the .NET services their Release build,
// the web app its production build, and logs say warnings and errors only. Development settings stay (demo users, dev
// credentials, plain HTTP).
var productionLike = builder.Configuration["ACME_PRODUCTION_LIKE"] == "1";

// `bun run start:prod --load-test`: the limits per address lifted, so `bun run load-test` can sign 200 people in and send
// thousands of requests a second from this one machine, which those limits exist to stop. The share per sign-in stays: a
// 429 in the load test still means one person asked for more than a person would. Never in production, where the load
// comes from many addresses and these limits are what stop one of them flooding the rest.
var loadTest = productionLike && builder.Configuration["ACME_LOAD_TEST"] == "1";

// Services. The .NET ones run as projects in `bun run dev` (Debug, `bun run rebuild` after a change) and as their Release
// build in `bun run start:prod` (ReleaseBuild, at the end of this file).
IResourceBuilder<IResourceWithServiceDiscovery> identityApi = productionLike
    ? IdentityApi(ReleaseBuild<Projects.Acme_Identity_Service>("identity-api", port: 5270))
    : IdentityApi(builder.AddProject<Projects.Acme_Identity_Service>("identity-api"));

IResourceBuilder<T> IdentityApi<T>(IResourceBuilder<T> service)
    where T : IResourceWithServiceDiscovery, IResourceWithEnvironment, IResourceWithWaitSupport
{
    service
        .WithHttpHealthCheck("/v1/system/health")
        .WithReference(identityDb)
        .WaitFor(identityDb);
    if (loadTest)
    {
        service.WithEnvironment("RateLimits__SignInPerMinute", "100000");
    }

    return service;
}

IResourceBuilder<IResourceWithServiceDiscovery> documentApi = productionLike
    ? DocumentApi(ReleaseBuild<Projects.Acme_Documents_Service>("document-api", port: 5280))
    : DocumentApi(builder.AddProject<Projects.Acme_Documents_Service>("document-api"));

IResourceBuilder<T> DocumentApi<T>(IResourceBuilder<T> service)
    where T : IResourceWithServiceDiscovery, IResourceWithEnvironment, IResourceWithWaitSupport =>
    service
        .WithHttpHealthCheck("/v1/system/health")
        .WithReference(documentsDb)
        .WithReference(rabbitmq)
        .WithReference(identityApi)
        .WaitFor(documentsDb)
        .WaitFor(rabbitmq)
        .WaitFor(identityApi);

// One key signs every export download link for all dealership-api copies: a link one copy made must open on whichever
// copy the gateway sends the download to. A deployment sets EXPORT_LINK_KEY; here it lasts until the next start.
var exportLinkKey = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));

// The Bun apps run as plain executables: `bun install` at the repo root already installs every workspace.
// In start:prod every service listens on its own port with nothing in between, as in production: by default Aspire puts
// its own proxy (dcp) in front of each endpoint, and under a load test that proxy, not the system, was the limit (at 800
// requests a second it used most of a core while connections sat waiting, ACME-129). In `bun run dev` the proxy stays:
// it lets a service restart on a rebuild without the others noticing.
const int DealershipApiPort = 5301;
var dealershipApi = builder.AddExecutable("dealership-api", "bun", "../../backend/dealership-api", "run", productionLike ? "serve" : "dev")
    .WithEnvironment("EXPORT_LINK_KEY", exportLinkKey)
    .WithHttpEndpoint(port: productionLike ? DealershipApiPort : null, env: "PORT", isProxied: !productionLike)
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
    .Select(number => builder.AddExecutable($"dealership-api-{number}", "bun", "../../backend/dealership-api", productionLike ? ["run", "start"] : ["run", "dev", "replica"])
        .WithEnvironment("EXPORT_LINK_KEY", exportLinkKey)
        .WithHttpEndpoint(port: productionLike ? DealershipApiPort + number - 1 : null, env: "PORT", isProxied: !productionLike)
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
builder.AddExecutable("export-worker", "bun", "../../backend/dealership-api", "run", productionLike ? "start:worker" : "worker")
    .WithOtlpExporter()
    .WithReference(dealershipDb)
    .WaitFor(dealershipApi);

// The single entry point for the web app: /api/<service>/... is routed to that service with the prefix removed.
IResourceBuilder<IResourceWithServiceDiscovery> gateway = productionLike
    ? GatewayApi(ReleaseBuild<Projects.Acme_Gateway_Service>("gateway-api", port: 5200))
    : GatewayApi(builder.AddProject<Projects.Acme_Gateway_Service>("gateway-api"));

IResourceBuilder<T> GatewayApi<T>(IResourceBuilder<T> service)
    where T : IResourceWithServiceDiscovery, IResourceWithEnvironment, IResourceWithWaitSupport
{
    service
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
        service.WithEnvironment($"services__dealership-api__http__{index + 1}", dealershipApiReplicas[index].GetEndpoint("http"));
    }

    if (loadTest)
    {
        service
            .WithEnvironment("RateLimit__AddressBurst", "1000000")
            .WithEnvironment("RateLimit__AddressRequestsPerSecond", "1000000");
    }

    return service;
}

// The sample data (scripts/seed.ts), loaded through the gateway once everything is up. It runs on every start and is
// safe to: it reuses what is already there. `bun run seed` runs the same script by hand.
builder.AddExecutable("seed", "bun", "../..", "scripts/seed.ts")
    .WithReference(gateway)
    .WaitFor(gateway);

var web = productionLike
    ? builder.AddExecutable("web", "bun", "../..", "scripts/serve-web.ts")
    : builder.AddExecutable("web", "bun", "../../web", "run", "dev");
web
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints()
    .WithReference(gateway)
    .WaitFor(gateway);

// Warnings and errors only when measuring: an info line per request is work the production log level would not do.
if (productionLike)
{
    foreach (var service in builder.Resources.OfType<IResourceWithEnvironment>().Where(resource => resource is ProjectResource or ExecutableResource))
    {
        builder.CreateResourceBuilder(service)
            .WithEnvironment("LOG_LEVEL", "warn")
            .WithEnvironment("Logging__LogLevel__Default", "Warning");
    }
}

await builder.Build().RunAsync();

// A .NET service's Release build, run as it is (`dotnet <its assembly>`), for `bun run start:prod`. Not as a project:
// Aspire starts a project in the AppHost's own build configuration, and `aspire run` starts the AppHost's Debug build
// even after building it in Release (Aspire CLI 13.6.4), so a project would run in Debug however start:prod built it.
// start:prod builds in Release (Configuration=Release), and the AppHost's references compile every service with it.
// Like a project here: the port and environment its launch profile gives it (Properties/launchSettings.json), its
// traces and logs sent to the dashboard, and other resources reach it by name.
IResourceBuilder<ReleaseBuildResource> ReleaseBuild<TProject>(string name, int port)
    where TProject : IProjectMetadata, new()
{
    var project = new TProject().ProjectPath;
    var directory = Path.GetDirectoryName(project)!;
    var assembly = Path.Combine(directory, "bin", "Release", "net10.0", $"{Path.GetFileNameWithoutExtension(project)}.dll");
    return builder.AddResource(new ReleaseBuildResource(name, directory))
        .WithArgs(assembly)
        // Only start:prod runs a Release build: no proxy in front of it (see dealership-api above). It listens on
        // localhost, which Kestrel opens as one IPv4 and one IPv6 socket: given only a port, it opened one dual-stack
        // socket, whose accept loop failed for good on macOS under a load test's IPv4 connections ("The supplied
        // SocketAddress is an invalid size for the IPEndPoint", ACME-129).
        .WithHttpEndpoint(port: port, isProxied: false)
        .WithEnvironment("ASPNETCORE_URLS", "http://localhost:" + port.ToString(System.Globalization.CultureInfo.InvariantCulture))
        .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
        .WithOtlpExporter();
}

/// <summary>A process started with <c>dotnet</c> that other resources can reference by name, as they do a project.</summary>
internal sealed class ReleaseBuildResource(string name, string workingDirectory)
    : ExecutableResource(name, "dotnet", workingDirectory), IResourceWithServiceDiscovery;
