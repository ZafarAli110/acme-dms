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

await app.RunAsync();
