using System.Reflection;
using Acme.Gateway;
using Acme.Gateway.Sessions;
using Acme.ServiceDefaults;
using Microsoft.EntityFrameworkCore;
using Yarp.ReverseProxy.Transforms;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Aspire injects ConnectionStrings__gateway for the "gateway" database resource: the browsers' sessions.
var connectionString = builder.Configuration.GetConnectionString("gateway")
    ?? throw new InvalidOperationException("Connection string 'gateway' is not configured.");
builder.Services.AddDbContext<GatewayDbContext>(options => options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention());
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<SessionStore>();
// The gateway signs browsers in at identity-api, and renews their tokens there (see SessionEndpoints).
builder.Services
    .AddHttpClient<IdentityClient>(client =>
    {
        client.BaseAddress = new Uri("http://identity-api");
        client.Timeout = TimeSpan.FromSeconds(5);
    })
    .AddServiceDiscovery();

// Routes and clusters live in appsettings.json. Destinations are service names (http://identity-api),
// resolved by service discovery from the addresses Aspire injects.
builder.Services.AddServiceDiscovery();
builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(context =>
    {
        // A 201's Location is relative to the service; give it back the prefix this route removed (LocationPrefix).
        var prefix = context.Route.Transforms?
            .Select(transform => transform.TryGetValue("PathRemovePrefix", out var value) ? value : null)
            .FirstOrDefault(value => value is not null);
        if (prefix is null)
        {
            return;
        }

        context.AddResponseTransform(transformContext =>
        {
            var headers = transformContext.HttpContext.Response.Headers;
            var location = headers.Location.ToString();
            if (location.Length > 0)
            {
                headers.Location = LocationPrefix.Apply(prefix, location);
            }

            return ValueTask.CompletedTask;
        });
    })
    .AddServiceDiscoveryDestinationResolver();

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    await scope.ServiceProvider.GetRequiredService<GatewayDbContext>().Database.MigrateAsync();
}

// The gateway is the browser's backend: it keeps each browser's sign-in (a session cookie) and sends its access token on
// (SessionMiddleware). It decides nothing else: every service checks the token and what the person may do.
app.UseServiceDefaults();
app.UseMiddleware<SessionMiddleware>();
app.MapSessionEndpoints();
app.MapReverseProxy();
app.MapServiceDefaults();

// The gateway's own health, in the same shape as every service's, with its sessions database.
// The version ("26.11.0") is the one Directory.Build.props gives every assembly.
var version = typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "unknown";
app.MapGet("/v1/system/health", async (GatewayDbContext dbContext, CancellationToken cancellationToken) =>
    new HealthCheckResponse("gateway-api", "ok", version, await dbContext.Database.CanConnectAsync(cancellationToken)));

await app.RunAsync();

/// <summary>The same shape every service's GET /v1/system/health returns.</summary>
internal sealed record HealthCheckResponse(string Service, string Status, string Version, bool? DatabaseReachable);
