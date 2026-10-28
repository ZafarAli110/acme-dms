using Acme.Identity.Persistence.Auditing;
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
builder.Services.AddControllers();
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
    await scope.ServiceProvider.GetRequiredService<IdentitySeeder>().SeedAsync(CancellationToken.None).ConfigureAwait(false);
}

app.UseServiceDefaults();
app.UseAcmeAuthorization();
app.MapControllers();
app.MapServiceDefaults();

await app.RunAsync().ConfigureAwait(false);
