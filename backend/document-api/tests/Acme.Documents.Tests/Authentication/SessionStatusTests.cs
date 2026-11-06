using System.Net;
using System.Security.Claims;
using Acme.ServiceDefaults.Authentication;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Acme.Documents.Tests.Authentication;

/// <summary>How a service learns that a sign-in was ended: it asks identity-api, and remembers the answer briefly.</summary>
[TestClass]
public sealed class SessionStatusTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task AnOpenSignIn_IsAskedAgainOnlyAfterTenSeconds_SoEndingOneReachesAServiceWithinThem()
    {
        var clock = new TestClock();
        var cache = new SessionStatusCache(new MemoryCache(new MemoryCacheOptions { Clock = clock.AsSystemClock() }), clock);
        var asked = 0;
        var session = NewSession(clock);

        Task<bool> Ask(CancellationToken _)
        {
            asked++;
            return Task.FromResult(true);
        }

        await cache.IsActiveAsync(session, Ask, TestContext.CancellationToken);
        await cache.IsActiveAsync(session, Ask, TestContext.CancellationToken);
        Assert.AreEqual(1, asked);

        clock.Advance(TimeSpan.FromSeconds(11));
        await cache.IsActiveAsync(session, Ask, TestContext.CancellationToken);
        Assert.AreEqual(2, asked);
    }

    [TestMethod]
    public async Task AnEndedSignIn_IsNeverAskedAgain_ForAsLongAsItsAccessTokenCouldBeShown()
    {
        var clock = new TestClock();
        var cache = new SessionStatusCache(new MemoryCache(new MemoryCacheOptions { Clock = clock.AsSystemClock() }), clock);
        var asked = 0;
        var session = NewSession(clock);

        Task<bool> Ask(CancellationToken _)
        {
            asked++;
            return Task.FromResult(false);
        }

        Assert.IsFalse(await cache.IsActiveAsync(session, Ask, TestContext.CancellationToken));
        clock.Advance(TimeSpan.FromMinutes(10));
        Assert.IsFalse(await cache.IsActiveAsync(session, Ask, TestContext.CancellationToken));

        Assert.AreEqual(1, asked);
    }

    [TestMethod]
    public async Task IdentityApi_ThatSays401_EndsTheSignIn_AndAnyOtherAnswerOrNoAnswerDoesNot()
    {
        Assert.IsFalse(await CheckAsync(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized)));
        Assert.IsTrue(await CheckAsync(_ => new HttpResponseMessage(HttpStatusCode.NoContent)));
        // A service does not stop serving because the sign-in authority is failing or restarting.
        Assert.IsTrue(await CheckAsync(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError)));
        Assert.IsTrue(await CheckAsync(_ => new HttpResponseMessage(HttpStatusCode.Forbidden)));
        Assert.IsTrue(await CheckAsync(_ => throw new HttpRequestException("identity-api is restarting")));
    }

    [TestMethod]
    public async Task RequestsThatFindNothingRememberedTogether_ShareOneQuestion()
    {
        var clock = new TestClock();
        var cache = new SessionStatusCache(new MemoryCache(new MemoryCacheOptions()), clock);
        var session = NewSession(clock);
        var asked = 0;
        var release = new TaskCompletionSource();

        async Task<bool> Ask(CancellationToken _)
        {
            Interlocked.Increment(ref asked);
            await release.Task;
            return true;
        }

        var together = Enumerable.Range(0, 6).Select(_ => cache.IsActiveAsync(session, Ask, TestContext.CancellationToken)).ToList();
        release.SetResult();
        var answers = await Task.WhenAll(together);

        Assert.AreEqual(1, asked);
        Assert.IsTrue(answers.All(answer => answer));
    }

    [TestMethod]
    public async Task AnEndedSignIn_IsAskedAgainOnceItsAccessTokenCouldNoLongerBeShown()
    {
        var clock = new TestClock();
        var cache = new SessionStatusCache(new MemoryCache(new MemoryCacheOptions { Clock = clock.AsSystemClock() }), clock);
        var session = NewSession(clock);
        var asked = 0;

        Task<bool> Ask(CancellationToken _)
        {
            asked++;
            return Task.FromResult(false);
        }

        await cache.IsActiveAsync(session, Ask, TestContext.CancellationToken);
        clock.Advance(TimeSpan.FromMinutes(16));
        await cache.IsActiveAsync(session, Ask, TestContext.CancellationToken);

        Assert.AreEqual(2, asked);
    }

    [TestMethod]
    public async Task TheTokenHook_RefusesAnEndedSignIn_AcceptsAnOpenOne_AndLeavesTokensWithoutASignInIdToTheirExpiry()
    {
        var ended = await ValidateAsync(sessionIsActive: false, claims: [new Claim("sid", Guid.NewGuid().ToString())]);
        var open = await ValidateAsync(sessionIsActive: true, claims: [new Claim("sid", Guid.NewGuid().ToString())]);
        var noSid = await ValidateAsync(sessionIsActive: false, claims: []);

        Assert.IsNotNull(ended.Result?.Failure, "a token whose sign-in ended must be refused");
        Assert.IsNull(open.Result);
        Assert.IsNull(noSid.Result);
    }

    [TestMethod]
    public async Task TheCheck_SendsTheAccessTokenToIdentityApi()
    {
        HttpRequestMessage? seen = null;

        await CheckAsync(request =>
        {
            seen = request;
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        });

        Assert.AreEqual("http://identity-api/v1/sessions/current", seen!.RequestUri!.ToString());
        Assert.AreEqual("Bearer", seen.Headers.Authorization!.Scheme);
        Assert.AreEqual("the-access-token", seen.Headers.Authorization.Parameter);
    }

    private async Task<bool> CheckAsync(Func<HttpRequestMessage, HttpResponseMessage> answer)
    {
        var clock = new TestClock();
        var cache = new SessionStatusCache(new MemoryCache(new MemoryCacheOptions()), clock);
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["services:identity-api:http:0"] = "http://identity-api" })
            .Build();
        var checker = new HttpSessionStatusChecker(new HttpClient(new FakeHandler(answer)), cache, configuration, NullLogger<HttpSessionStatusChecker>.Instance);
        return await checker.IsActiveAsync(NewSession(clock), TestContext.CancellationToken);
    }

    private async Task<TokenValidatedContext> ValidateAsync(bool sessionIsActive, IEnumerable<Claim> claims)
    {
        var services = new ServiceCollection();
        services.AddSingleton<ISessionStatusChecker>(new FixedChecker(sessionIsActive));
        var httpContext = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() };
        var token = new JsonWebToken(new JsonWebTokenHandler().CreateToken(new Microsoft.IdentityModel.Tokens.SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(15),
        }));
        var context = new TokenValidatedContext(httpContext, new AuthenticationScheme("Bearer", null, typeof(JwtBearerHandler)), new JwtBearerOptions())
        {
            Principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer")),
            SecurityToken = token,
        };
        await Acme.ServiceDefaults.Authentication.AuthenticationServiceCollectionExtensions.EndedSessionsAreRefusedAsync(context);
        return context;
    }

    private sealed class FixedChecker(bool active) : ISessionStatusChecker
    {
        public Task<bool> IsActiveAsync(AccessTokenSession session, CancellationToken cancellationToken) => Task.FromResult(active);
    }

    private static AccessTokenSession NewSession(TimeProvider clock) =>
        new(Guid.NewGuid(), "the-access-token", clock.GetUtcNow().AddMinutes(15));

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> answer) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(answer(request));
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = DateTimeOffset.UtcNow;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;

        public Microsoft.Extensions.Internal.ISystemClock AsSystemClock() => new Clock(this);

        private sealed class Clock(TestClock owner) : Microsoft.Extensions.Internal.ISystemClock
        {
            public DateTimeOffset UtcNow => owner._now;
        }
    }
}
