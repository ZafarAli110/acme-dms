using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using Acme.ServiceDefaults.Authentication;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Acme.Documents.Tests.Authentication;

/// <summary>How a service learns that a sign-in was ended: it keeps the list of ended sign-ins, asking identity-api every few seconds.</summary>
[TestClass]
public sealed class SessionStatusTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ASignInIdentityApiListedAsEnded_IsRefused_AndOthersAreNot()
    {
        var ended = Guid.NewGuid();
        var open = Guid.NewGuid();
        var clock = new TestClock();
        var identity = new FakeIdentity(clock) { Revoked = { ended } };
        var feed = NewFeed(identity, clock);

        await feed.RefreshAsync(TestContext.CancellationToken);

        Assert.IsFalse(await feed.IsActiveAsync(NewSession(ended, clock), TestContext.CancellationToken));
        Assert.IsTrue(await feed.IsActiveAsync(NewSession(open, clock), TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task ALookup_NeverCallsIdentityApi()
    {
        var clock = new TestClock();
        var identity = new FakeIdentity(clock);
        var feed = NewFeed(identity, clock);
        await feed.RefreshAsync(TestContext.CancellationToken);

        for (var i = 0; i < 50; i++)
        {
            await feed.IsActiveAsync(NewSession(Guid.NewGuid(), clock), TestContext.CancellationToken);
        }

        Assert.AreEqual(1, identity.Questions.Count);
    }

    [TestMethod]
    public async Task TheFirstQuestionLooksBackAsFarAsAnAccessTokenCanLive_AndTheNextStartsAtTheLastAnswer()
    {
        var clock = new TestClock();
        var identity = new FakeIdentity(clock);
        var feed = NewFeed(identity, clock);

        await feed.RefreshAsync(TestContext.CancellationToken);
        clock.Advance(TimeSpan.FromSeconds(5));
        await feed.RefreshAsync(TestContext.CancellationToken);

        Assert.AreEqual(clock.GetUtcNow().AddSeconds(-5) - RevokedSessionsFeed.RememberFor, identity.Questions[0]);
        // The last answer's own clock, a little back (so an end at that very moment is not missed).
        Assert.AreEqual(clock.GetUtcNow().AddSeconds(-5).AddSeconds(-2), identity.Questions[1]);
    }

    [TestMethod]
    public async Task AfterALongOutage_TheFirstAnswerStillCoversEveryTokenThatCanBeShown()
    {
        var clock = new TestClock();
        var identity = new FakeIdentity(clock);
        var feed = NewFeed(identity, clock);
        await feed.RefreshAsync(TestContext.CancellationToken);
        identity.Down = true;
        clock.Advance(TimeSpan.FromHours(2));
        await feed.RefreshAsync(TestContext.CancellationToken);
        identity.Down = false;

        await feed.RefreshAsync(TestContext.CancellationToken);

        // The last good answer is two hours old: the question starts where it left off, and identity-api caps it at the
        // token lifetime, so it is never asked to look further back than a token can live.
        Assert.IsTrue(identity.Questions.Last() <= clock.GetUtcNow().AddHours(-2).AddMinutes(1));
    }

    [TestMethod]
    public async Task WhenIdentityApiCannotBeReached_WhatIsKnownIsKept_AndNothingIsRefused()
    {
        var ended = Guid.NewGuid();
        var clock = new TestClock();
        var identity = new FakeIdentity(clock) { Revoked = { ended } };
        var feed = NewFeed(identity, clock);
        await feed.RefreshAsync(TestContext.CancellationToken);

        identity.Down = true;
        await feed.RefreshAsync(TestContext.CancellationToken);

        Assert.IsFalse(await feed.IsActiveAsync(NewSession(ended, clock), TestContext.CancellationToken));
        Assert.IsTrue(await feed.IsActiveAsync(NewSession(Guid.NewGuid(), clock), TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task AnEndedSignIn_IsForgottenOnceItsAccessTokenCouldNoLongerBeShown()
    {
        var ended = Guid.NewGuid();
        var clock = new TestClock();
        var identity = new FakeIdentity(clock) { Revoked = { ended } };
        var feed = NewFeed(identity, clock);
        await feed.RefreshAsync(TestContext.CancellationToken);
        identity.Revoked.Clear();

        clock.Advance(RevokedSessionsFeed.RememberFor - TimeSpan.FromSeconds(1));
        await feed.RefreshAsync(TestContext.CancellationToken);
        Assert.IsTrue(feed.IsRevoked(ended));

        clock.Advance(TimeSpan.FromSeconds(2));
        await feed.RefreshAsync(TestContext.CancellationToken);
        Assert.IsFalse(feed.IsRevoked(ended));
    }

    [TestMethod]
    public async Task TheService_AsksOnceBeforeItTakesRequests()
    {
        var clock = new TestClock();
        var identity = new FakeIdentity(clock) { Revoked = { Guid.NewGuid() } };
        var feed = NewFeed(identity, clock);

        await feed.StartAsync(TestContext.CancellationToken);
        await feed.StopAsync(TestContext.CancellationToken);

        Assert.IsGreaterThanOrEqualTo(1, identity.Questions.Count);
    }

    [TestMethod]
    public async Task TheTokenHook_RefusesAnEndedSignIn_AcceptsAnOpenOne_AndRefusesATokenWithNoSignInId()
    {
        var ended = await ValidateAsync(sessionIsActive: false, claims: [new Claim("sid", Guid.NewGuid().ToString())]);
        var open = await ValidateAsync(sessionIsActive: true, claims: [new Claim("sid", Guid.NewGuid().ToString())]);
        var noSid = await ValidateAsync(sessionIsActive: true, claims: []);

        Assert.IsNotNull(ended.Result?.Failure, "a token whose sign-in ended must be refused");
        Assert.IsNull(open.Result);
        Assert.IsNotNull(noSid.Result?.Failure, "a token with no sign-in id could never be ended, so it is not accepted");
    }

    private RevokedSessionsFeed NewFeed(FakeIdentity identity, TimeProvider clock)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["services:identity-api:http:0"] = "http://identity-api" })
            .Build();
        return new RevokedSessionsFeed(new HttpClient(identity), clock, configuration, NullLogger<RevokedSessionsFeed>.Instance);
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

    private static AccessTokenSession NewSession(Guid sessionId, TimeProvider clock) =>
        new(sessionId, "the-access-token", clock.GetUtcNow().AddMinutes(15));

    private sealed class FixedChecker(bool active) : ISessionStatusChecker
    {
        public Task<bool> IsActiveAsync(AccessTokenSession session, CancellationToken cancellationToken) => Task.FromResult(active);
    }

    /// <summary>identity-api, as the feed sees it: it answers with the ids it has and remembers what it was asked.</summary>
    private sealed class FakeIdentity(TimeProvider clock) : HttpMessageHandler
    {
        public List<Guid> Revoked { get; } = [];

        public List<DateTimeOffset> Questions { get; } = [];

        public bool Down { get; set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (Down)
            {
                throw new HttpRequestException("identity-api is down");
            }

            var since = DateTimeOffset.Parse(Uri.UnescapeDataString(request.RequestUri!.Query.Replace("?since=", string.Empty)), System.Globalization.CultureInfo.InvariantCulture);
            Questions.Add(since);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { now = clock.GetUtcNow(), revoked = Revoked }),
            });
        }
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = DateTimeOffset.Parse("2026-11-07T10:00:00Z", global::System.Globalization.CultureInfo.InvariantCulture);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }
}
