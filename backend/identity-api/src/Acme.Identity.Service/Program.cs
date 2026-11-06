using Acme.Identity.Persistence.Auditing;
using Microsoft.AspNetCore.HttpOverrides;
using Acme.Identity.Service;
using Acme.Identity.Service.Authorization;
using Acme.Identity.BusinessLogic;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.Persistence;
using Acme.Identity.Service.Middleware;
using Acme.ServiceDefaults;
using Acme.ServiceDefaults.Authentication;
using Acme.ServiceDefaults.DatabaseErrors;
using Microsoft.AspNetCore.Authentication.JwtBearer;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Aspire injects ConnectionStrings__identity for the "identity" database resource.
var connectionString = builder.Configuration.GetConnectionString("identity")
    ?? throw new InvalidOperationException("Connection string 'identity' is not configured.");

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentActor, HttpCurrentActor>();
builder.Services.AddPersistence(connectionString);
builder.Services.AddBusinessLogic();
// identity-api answers "is this sign-in open" from its own database; registered before AddAcmeAuthentication, which would
// otherwise ask identity-api over HTTP.
builder.Services.AddScoped<Acme.ServiceDefaults.Authentication.ISessionStatusChecker, Acme.Identity.Service.Authorization.DbSessionStatusChecker>();
builder.Services.AddControllers();
// The gateway forwards the caller's address in X-Forwarded-For; the services are reached only through it. With one hop trusted
// (the gateway's, the last entry), a client cannot choose its own address by sending the header itself. Do not expose identity-api
// to the internet directly: then that header would be the client's.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});
builder.Services.AddAcmeRateLimits();
builder.Services.AddMemoryCache();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
// After the service's own handler: Postgres failures become 409/400/503 with a meaningful message, not a 500. The
// unique indexes get their own message (names from IdentityDbContext's HasIndex(...).IsUnique()).
builder.Services.AddAcmeDatabaseErrors(options =>
{
    options.ConstraintMessages["ix_users_email"] = "A user with this email already exists.";
    options.ConstraintMessages["ix_locations_dealer_id_code"] = "This dealer already has a location with this code.";
});

builder.Services.AddAcmeAuthentication(builder.Configuration);

// identity-api validates its own tokens with the key it signs them with; other services use JWKS discovery.
builder.Services
    .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<ISigningKeyProvider>((options, keyProvider) =>
        options.TokenValidationParameters.IssuerSigningKeyResolver = (_, _, _, _) =>
            [keyProvider.GetSigningKeyAsync(CancellationToken.None).GetAwaiter().GetResult()]);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<IdentitySeeder>().SeedAsync(CancellationToken.None);
}

app.UseForwardedHeaders();
app.UseServiceDefaults();
app.UseRateLimiter();
app.UseAcmeAuthorization();
app.MapControllers();

// Development only: `bun run reset` puts every demo user back on the locations DemoData lists, undoing what a manager
// changed on the Locations page. It has no token to send, so the endpoint takes none; it doesn't exist outside
// Development.
if (app.Environment.IsDevelopment())
{
    app.MapPost("v1/dev/demo-users/reset", async (IdentitySeeder seeder, CancellationToken cancellationToken) =>
    {
        await seeder.ResetDemoUsersAsync(cancellationToken);
        return Results.NoContent();
    }).AllowAnonymous();
}
app.MapServiceDefaults();

await app.RunAsync();
