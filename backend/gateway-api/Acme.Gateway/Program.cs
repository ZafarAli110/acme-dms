using System.Reflection;
using Acme.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Routes and clusters live in appsettings.json. Destinations are service names (http://identity-api),
// resolved by service discovery from the addresses Aspire injects.
builder.Services.AddServiceDiscovery();
builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddServiceDiscoveryDestinationResolver();

var app = builder.Build();

// The gateway only routes. Authentication and authorization happen in each service.
app.UseServiceDefaults();
app.MapReverseProxy();
app.MapServiceDefaults();

// The gateway's own health, in the same shape as every service's: it has no database, so DatabaseReachable is null.
// The version ("26.11.0") is the one Directory.Build.props gives every assembly.
var version = typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "unknown";
app.MapGet("/v1/system/health", () => new HealthCheckResponse("gateway-api", "ok", version, null)).AllowAnonymous();

await app.RunAsync();

/// <summary>The same shape every service's GET /v1/system/health returns.</summary>
internal sealed record HealthCheckResponse(string Service, string Status, string Version, bool? DatabaseReachable);
