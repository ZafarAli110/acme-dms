using Acme.Documents.BusinessLogic;
using Acme.Documents.Messaging;
using Acme.Documents.Persistence;
using Acme.Documents.Service.Authorization;
using Acme.Documents.Service.Middleware;
using Acme.ServiceDefaults;
using Acme.ServiceDefaults.Authentication;
using Acme.ServiceDefaults.DatabaseErrors;
using Acme.Documents.Persistence.Auditing;
using Acme.Documents.Persistence.Database;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Aspire injects ConnectionStrings__documents and ConnectionStrings__rabbitmq for the resources this service references.
var connectionString = builder.Configuration.GetConnectionString("documents")
    ?? throw new InvalidOperationException("Connection string 'documents' is not configured.");
var rabbitMqConnectionString = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("Connection string 'rabbitmq' is not configured.");

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IDealerScope, HttpDealerScope>();
builder.Services.AddScoped<ICurrentActor, HttpCurrentActor>();
builder.Services.AddPersistence(connectionString);
builder.Services.AddBusinessLogic();
builder.Services.AddMessaging(rabbitMqConnectionString);
builder.Services.AddControllers();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
// After the service's own handler: Postgres failures become 409/400/503 with a meaningful message, not a 500.
builder.Services.AddAcmeDatabaseErrors();
builder.Services.AddAcmeAuthentication(builder.Configuration);

var app = builder.Build();

await app.Services.MigrateDocumentsDatabaseAsync(CancellationToken.None).ConfigureAwait(false);

app.UseServiceDefaults();
app.UseAcmeAuthorization();
app.MapControllers();
app.MapServiceDefaults();

await app.RunAsync().ConfigureAwait(false);
