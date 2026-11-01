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

// The gateway's own health, like every service's: up, and which version ("26.11.0", from Directory.Build.props).
var version = typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "unknown";
app.MapGet("/v1/system/health", () => new { status = "ok", version }).AllowAnonymous();

await app.RunAsync();
