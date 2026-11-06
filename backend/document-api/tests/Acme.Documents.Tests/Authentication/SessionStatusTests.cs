using System.Net;
using Acme.ServiceDefaults.Authentication;
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
    public async Task IdentityApi_ThatSays401_EndsTheSignIn_AndOneThatSays204OrIsDown_DoesNot()
    {
        Assert.IsFalse(await CheckAsync(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized)));
        Assert.IsTrue(await CheckAsync(_ => new HttpResponseMessage(HttpStatusCode.NoContent)));
        Assert.IsTrue(await CheckAsync(_ => throw new HttpRequestException("identity-api is restarting")));
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
