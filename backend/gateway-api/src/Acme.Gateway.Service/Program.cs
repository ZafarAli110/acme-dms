using Acme.Gateway.BusinessLogic;
using Acme.Gateway.Persistence;
using Acme.Gateway.RestClients;
using Acme.Gateway.Service;
using Acme.Gateway.Service.Authorization;
using Acme.Gateway.Service.Middleware;
using System.Net;
using Acme.ServiceDefaults;
using Acme.ServiceDefaults.DatabaseErrors;
using Microsoft.AspNetCore.HttpOverrides;
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
// identity-api unavailable becomes a 503, as the services' ApiExceptionHandler does for theirs; then Postgres failures
// (the sessions database busy or down) become 503 or 409, not a 500.
builder.Services.AddExceptionHandler<GatewayExceptionHandler>();
builder.Services.AddAcmeDatabaseErrors();
// Behind a load balancer the browser's address is the one it reports (X-Forwarded-For), from the proxies named in
// ForwardedHeaders:KnownProxies only: identity-api's per-address sign-in limit then counts each person, not the balancer.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    foreach (var proxy in builder.Configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [])
    {
        options.KnownProxies.Add(IPAddress.Parse(proxy));
    }
});

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

builder.Services.AddPerUserRateLimit(builder.Configuration);

var app = builder.Build();

await app.Services.MigrateDatabaseAsync(CancellationToken.None);

// The gateway is the browser's backend: it keeps each browser's sign-in (a session cookie) and sends its access token on
// (SessionMiddleware). It decides nothing else: every service checks the token and what the person may do.
app.UseForwardedHeaders();
if (!app.Environment.IsDevelopment())
{
    // Browsers keep to HTTPS for this site from then on: the session cookie never travels in the clear.
    app.UseHsts();
}

app.UseServiceDefaults();
// Before the session lookup: a request over its user's share costs nothing more than the 429.
app.UseRateLimiter();
app.UseMiddleware<SessionMiddleware>();
app.MapControllers();
app.MapReverseProxy();
app.MapServiceDefaults();

await app.RunAsync();
