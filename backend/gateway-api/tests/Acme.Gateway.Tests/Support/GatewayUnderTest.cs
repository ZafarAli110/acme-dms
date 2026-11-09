using System.Net;
using System.Net.Http.Json;
using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.Persistence.Database;
using Acme.Gateway.RestClients.Identity;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Yarp.ReverseProxy.Forwarder;

namespace Acme.Gateway.Tests.Support;

/// <summary>
/// The gateway in memory, on a database of its own (<see cref="TestPostgres"/>), with identity-api and the services replaced by
/// fakes that answer as they do and remember what they were asked, and a browser-like client that keeps cookies.
/// </summary>
internal sealed class GatewayUnderTest : IAsyncDisposable
{
    /// <summary>The session cookie's name: the same in every environment (ACME-130).</summary>
    public const string CookieName = "__Host-acme_session";

    /// <summary>The browser's address: HTTPS, as the web server in front of the gateway is, so it keeps a <c>Secure</c> cookie.</summary>
    private static readonly Uri _browserBase = new("https://localhost");

    /// <summary>Where every request comes from: the in-memory server has no network, so it is set here as Kestrel would.</summary>
    public const string BrowserAddress = "203.0.113.7";

    /// <summary>The services the gateway forwards to: their health probes are off in tests.</summary>
    private static readonly string[] _clusters = ["identity-api", "dealership-api", "document-api"];

    private readonly WebApplicationFactory<Program> _factory;

    private GatewayUnderTest(string connectionString, IReadOnlyDictionary<string, string> settings)
    {
        ConnectionString = connectionString;
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:gateway", connectionString);
            builder.UseSetting("services:identity-api:http:0", "http://identity.test");
            builder.UseSetting("services:dealership-api:http:0", "http://dealership.test");
            builder.UseSetting("services:document-api:http:0", "http://documents.test");
            // No health probes in tests: they would reach FakeService and add to what it records.
            foreach (var cluster in _clusters)
            {
                builder.UseSetting($"ReverseProxy:Clusters:{cluster}:HealthCheck:Active:Enabled", "false");
            }
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
            builder.ConfigureServices(services =>
            {
                services.AddHttpClient<IIdentityClient, IdentityClient>()
                    .ConfigurePrimaryHttpMessageHandler(() => Identity)
                    // A loaded test machine must not time out a call the test is holding on purpose.
                    .ConfigureHttpClient(client => client.Timeout = TimeSpan.FromMinutes(1));
                services.AddSingleton<IForwarderHttpClientFactory>(new ForwardTo(Service));
                services.AddSingleton<IStartupFilter>(new FromAddress(BrowserAddress));
            });
        });
        Browser = _factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = _browserBase });
    }

    public string ConnectionString { get; }

    public FakeIdentity Identity { get; } = new();

    public FakeService Service { get; } = new();

    /// <summary>Keeps the cookies the gateway sets, as a browser does.</summary>
    public HttpClient Browser { get; }

    /// <summary>The gateway's services, to call its handlers directly.</summary>
    public IServiceProvider Services => _factory.Services;

    public static async Task<GatewayUnderTest> NewAsync(CancellationToken cancellationToken) =>
        new(await TestPostgres.NewDatabaseAsync(cancellationToken), new Dictionary<string, string>());

    /// <summary>The gateway with settings of its own, such as a small <c>RateLimit:Burst</c>.</summary>
    public static async Task<GatewayUnderTest> NewAsync(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken) =>
        new(await TestPostgres.NewDatabaseAsync(cancellationToken), settings);

    /// <summary>A second client, with no cookies of its own: a script, or someone else's browser.</summary>
    public HttpClient NewClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, BaseAddress = _browserBase });

    /// <summary>Signs in as the app's page does: the email, the password, and the page's own header.</summary>
    public Task<HttpResponseMessage> SignInAsync(string password, CancellationToken cancellationToken)
    {
        var request = FromThePage(HttpMethod.Post, "/api/session");
        request.Content = JsonContent.Create(new { email = "maria@acme.test", password });
        return Browser.SendAsync(request, cancellationToken);
    }

    /// <summary>Signs in and gives the session cookie's value.</summary>
    public async Task<string> SignInForCookieAsync(CancellationToken cancellationToken)
    {
        using var response = await SignInAsync("right", cancellationToken);
        return CookieOf(response);
    }

    /// <summary>A request as the app's page sends it.</summary>
    public static HttpRequestMessage FromThePage(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add("X-Requested-With", "acme-web");
        return request;
    }

    /// <summary>The session cookie's value from a sign-in's answer.</summary>
    public static string CookieOf(HttpResponseMessage signIn) =>
        signIn.Headers.GetValues("Set-Cookie").Single().Split(';')[0][(CookieName.Length + 1)..];

    public GatewayDbContext NewDbContext() => new(TestPostgres.OptionsFor(ConnectionString));

    public async ValueTask DisposeAsync()
    {
        Browser.Dispose();
        await _factory.DisposeAsync();
    }

    private sealed class FromAddress(string address) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((context, nextMiddleware) =>
            {
                context.Connection.RemoteIpAddress = IPAddress.Parse(address);
                return nextMiddleware(context);
            });
            next(app);
        };
    }

    /// <summary>YARP sends every proxied request through this, instead of over the network.</summary>
    private sealed class ForwardTo(HttpMessageHandler handler) : IForwarderHttpClientFactory
    {
        public HttpMessageInvoker CreateClient(ForwarderHttpClientContext context) => new(handler, disposeHandler: false);
    }
}
