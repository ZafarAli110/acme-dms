using Acme.Gateway.BusinessLogic;
using Acme.Gateway.Persistence;
using Acme.Gateway.RestClients;
using Acme.Gateway.Service;
using Acme.Gateway.Service.Sessions;
using Acme.ServiceDefaults;
using Yarp.ReverseProxy.Transforms;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Aspire injects ConnectionStrings__gateway for the "gateway" database resource: the browsers' sessions.
var connectionString = builder.Configuration.GetConnectionString("gateway")
    ?? throw new InvalidOperationException("Connection string 'gateway' is not configured.");
builder.Services.AddPersistence(connectionString);
builder.Services.AddBusinessLogic();
// The gateway signs browsers in at identity-api, and renews their tokens there; http://identity-api is found by service discovery.
builder.Services.AddRestClients().AddServiceDiscovery();
builder.Services.AddControllers();

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

await app.Services.MigrateDatabaseAsync(CancellationToken.None);

// The gateway is the browser's backend: it keeps each browser's sign-in (a session cookie) and sends its access token on
// (SessionMiddleware). It decides nothing else: every service checks the token and what the person may do.
app.UseServiceDefaults();
app.UseMiddleware<SessionMiddleware>();
app.MapControllers();
app.MapReverseProxy();
app.MapServiceDefaults();

await app.RunAsync();
