// Acme DMS local environment. `aspire run` starts everything below and prints the dashboard URL.
var builder = DistributedApplication.CreateBuilder(args);

// Development-only credentials, deliberately simple and fixed so people and tools can connect (see README).
var username = builder.AddParameter("dev-username", "acme");
var password = builder.AddParameter("dev-password", "acme", secret: true);

// Infrastructure (containers)
var postgres = builder.AddPostgres("postgres", username, password).WithDataVolume();
var identityDb = postgres.AddDatabase("identity");
var dealershipDb = postgres.AddDatabase("dealership");
var documentsDb = postgres.AddDatabase("documents");

var rabbitmq = builder.AddRabbitMQ("rabbitmq", username, password).WithManagementPlugin();

// Services
var identityApi = builder.AddProject<Projects.Acme_Identity_Service>("identity-api")
    .WithHttpHealthCheck("/health")
    .WithReference(identityDb)
    .WaitFor(identityDb);

var documentApi = builder.AddProject<Projects.Acme_Documents_Service>("document-api")
    .WithHttpHealthCheck("/health")
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

// The single entry point for the web app: /api/<service>/... is routed to that service with the prefix removed.
var gateway = builder.AddProject<Projects.Acme_Gateway>("gateway")
    .WithHttpHealthCheck("/health")
    .WithReference(identityApi)
    .WithReference(dealershipApi.GetEndpoint("http"))
    .WithReference(documentApi)
    .WaitFor(identityApi)
    .WaitFor(dealershipApi)
    .WaitFor(documentApi);

builder.AddExecutable("web", "bun", "../../web", "run", "dev")
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints()
    .WithReference(gateway)
    .WaitFor(gateway);

await builder.Build().RunAsync().ConfigureAwait(false);
