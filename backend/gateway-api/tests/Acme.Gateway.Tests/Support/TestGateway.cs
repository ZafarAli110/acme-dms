using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Acme.Gateway.Sessions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Testcontainers.PostgreSql;
using Yarp.ReverseProxy.Forwarder;

namespace Acme.Gateway.Tests.Support;

/// <summary>
/// The gateway in memory, on a database of its own in one real Postgres for the whole run (Testcontainers), with identity-api
/// and the services replaced by fakes that answer as they do and remember what they were asked.
/// </summary>
[TestClass]
public static class TestGateway
{
    private static PostgreSqlContainer? _container;

    [AssemblyInitialize]
    public static async Task StartAsync(TestContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        _container = new PostgreSqlBuilder("postgres:18.3").Build();
        await _container.StartAsync(context.CancellationToken);
    }

    [AssemblyCleanup]
    public static async Task StopAsync()
    {
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }

    /// <summary>A gateway on a new, empty database (it migrates it as it starts).</summary>
    internal static async Task<GatewayUnderTest> NewAsync(CancellationToken cancellationToken)
    {
        var container = _container ?? throw new InvalidOperationException("Postgres starts in AssemblyInitialize; is Docker running?");
        var name = $"gateway_{Guid.NewGuid():N}";
        await using (var connection = new NpgsqlConnection(container.GetConnectionString()))
        {
            await connection.OpenAsync(cancellationToken);
            await using var command = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        var connectionString = new NpgsqlConnectionStringBuilder(container.GetConnectionString()) { Database = name }.ConnectionString;
        return new GatewayUnderTest(connectionString);
    }
}

/// <summary>One gateway, its fakes, and a browser-like client (it keeps cookies).</summary>
internal sealed class GatewayUnderTest : IAsyncDisposable
{
    private readonly WebApplicationFactory<Program> _factory;

    internal GatewayUnderTest(string connectionString)
    {
        ConnectionString = connectionString;
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:gateway", connectionString);
            builder.UseSetting("services:identity-api:http:0", "http://identity.test");
            builder.UseSetting("services:dealership-api:http:0", "http://dealership.test");
            builder.UseSetting("services:document-api:http:0", "http://documents.test");
            builder.ConfigureServices(services =>
            {
                services.AddHttpClient<IdentityClient>().ConfigurePrimaryHttpMessageHandler(() => Identity);
                services.AddSingleton<IForwarderHttpClientFactory>(new ForwardTo(Service));
                services.AddSingleton<IStartupFilter>(new FromAddress(BrowserAddress));
            });
        });
        Browser = _factory.CreateClient();
    }

    public string ConnectionString { get; }

    /// <summary>Where every request comes from: the in-memory server has no network, so it is set here as Kestrel would.</summary>
    public const string BrowserAddress = "203.0.113.7";

    public FakeIdentity Identity { get; } = new();

    public FakeService Service { get; } = new();

    /// <summary>Keeps the cookies the gateway sets, as a browser does.</summary>
    public HttpClient Browser { get; }

    /// <summary>A second client, with no cookies of its own: a script, or someone else's browser.</summary>
    public HttpClient NewClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

    /// <summary>Signs in as the app's page does: the email, the password, and the page's own header.</summary>
    public Task<HttpResponseMessage> SignInAsync(string password, CancellationToken cancellationToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/session")
        {
            Content = JsonContent.Create(new { email = "maria@acme.test", password }),
        };
        request.Headers.Add("X-Requested-With", "acme-web");
        return Browser.SendAsync(request, cancellationToken);
    }

    /// <summary>A request as the app's page sends it.</summary>
    public static HttpRequestMessage FromThePage(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add("X-Requested-With", "acme-web");
        return request;
    }

    public GatewayDbContext NewDbContext() =>
        new(new DbContextOptionsBuilder<GatewayDbContext>().UseNpgsql(ConnectionString).UseSnakeCaseNamingConvention().Options);

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

/// <summary>
/// identity-api's token endpoints, as they answer: the password is "right"; each sign-in or refresh issues an access token and
/// a new refresh token (in <c>Set-Cookie</c>); a refresh token is good once, until <see cref="EndAll"/>.
/// </summary>
internal sealed class FakeIdentity : HttpMessageHandler
{
    private static readonly SymmetricSecurityKey _key = new(new byte[32]);
    private readonly ConcurrentDictionary<string, bool> _liveRefreshTokens = new();
    private int _issued;

    public static readonly Guid UserId = Guid.Parse("0190a000-0000-7000-8000-000000000001");

    /// <summary>How long the access tokens it issues live. Under a minute, the gateway renews before every request.</summary>
    public TimeSpan AccessTokenLifetime { get; set; } = TimeSpan.FromMinutes(15);

    public int Refreshes;

    public ConcurrentQueue<string> Revoked { get; } = new();

    public ConcurrentQueue<string?> ForwardedFor { get; } = new();

    /// <summary>Every refresh token stops working, as when identity-api ends the sign-in.</summary>
    public void EndAll() => _liveRefreshTokens.Clear();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        ForwardedFor.Enqueue(request.Headers.TryGetValues("X-Forwarded-For", out var forwarded) ? forwarded.Single() : null);
        var path = request.RequestUri!.AbsolutePath;
        if (path == "/v1/tokens")
        {
            var body = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return body.GetProperty("password").GetString() == "right" ? Issue() : Problem(HttpStatusCode.Unauthorized, "Wrong email or password.");
        }

        var presented = request.Headers.TryGetValues("Cookie", out var cookies) ? cookies.Single().Split('=', 2)[1] : "";
        if (path == "/v1/tokens/revoke")
        {
            Revoked.Enqueue(presented);
            _liveRefreshTokens.TryRemove(presented, out _);
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        }

        Interlocked.Increment(ref Refreshes);
        return _liveRefreshTokens.TryRemove(presented, out _) ? Issue() : Problem(HttpStatusCode.Unauthorized, "The sign-in has ended.");
    }

    private HttpResponseMessage Issue()
    {
        var number = Interlocked.Increment(ref _issued);
        var accessToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity([new Claim("sub", UserId.ToString()), new Claim("n", number.ToString(System.Globalization.CultureInfo.InvariantCulture))]),
            Expires = DateTime.UtcNow.Add(AccessTokenLifetime),
            NotBefore = DateTime.UtcNow.AddMinutes(-1),
            SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256),
        });
        var refreshToken = $"refresh-{number}";
        _liveRefreshTokens[refreshToken] = true;
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new { accessToken, tokenType = "Bearer", expiresIn = (int)AccessTokenLifetime.TotalSeconds }),
        };
        response.Headers.Add("Set-Cookie", $"acme_refresh={refreshToken}; path=/api/identity/v1/tokens; samesite=strict; httponly");
        return response;
    }

    private static HttpResponseMessage Problem(HttpStatusCode status, string detail) => new(status)
    {
        Content = new StringContent($$"""{"status":{{(int)status}},"detail":"{{detail}}"}""", System.Text.Encoding.UTF8, "application/problem+json"),
    };
}

/// <summary>Every service behind the gateway: answers 200 and remembers the Authorization header each request arrived with.</summary>
internal sealed class FakeService : HttpMessageHandler
{
    public ConcurrentQueue<string?> Authorizations { get; } = new();

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Authorizations.Enqueue(request.Headers.Authorization?.ToString());
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { ok = true }) });
    }
}
