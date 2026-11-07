using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.GetAccessToken;
using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.BusinessLogic.Handlers.Sessions;
using Acme.Gateway.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Acme.Gateway.Tests.Handlers.Sessions.GetAccessToken;

/// <summary>
/// The access token a request is sent on with, and its renewal: once per session at a time, by a lease, with no answer from
/// identity-api ever lost.
/// </summary>
[TestClass]
public sealed class GetAccessTokenCommandHandlerTests
{
    private static readonly CallerContext _caller = new(GatewayUnderTest.BrowserAddress, null);

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_GivesTheSessionsToken_WithoutRenewing_WhileItIsNotDue()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);

        var accessToken = await ExecuteAsync(gateway, cookie);

        StringAssert.StartsWith(accessToken, "eyJ");
        Assert.AreEqual(0, gateway.Identity.Refreshes);
    }

    [TestMethod]
    public async Task ExecuteAsync_RenewsOnce_WhileTheOtherRequestsSendTheTokenThatStillWorks()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromMinutes(15);

        var tokens = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => ExecuteAsync(gateway, cookie)));

        Assert.IsTrue(tokens.All(token => token is not null));
        Assert.AreEqual(1, gateway.Identity.Refreshes);
        Assert.IsTrue(gateway.Identity.ForwardedFor.All(address => address == GatewayUnderTest.BrowserAddress), "identity-api counts the browser");
        await using var dbContext = gateway.NewDbContext();
        var session = await dbContext.Sessions.SingleAsync(TestContext.CancellationToken);
        Assert.IsNull(session.RenewingUntil, "the lease is given back");
        Assert.IsGreaterThan(DateTimeOffset.UtcNow.AddMinutes(10), session.AccessTokenExpiresAt, "the session holds the renewed token");
    }

    [TestMethod]
    public async Task ExecuteAsync_WaitsForARenewalRunning_WhenItsOwnTokenHasExpired()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(-5);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromMinutes(15);
        gateway.Identity.HoldRefreshAnswer = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var renewing = ExecuteAsync(gateway, cookie);
        await gateway.Identity.RefreshReplaced.Task.WaitAsync(TimeSpan.FromSeconds(30), TestContext.CancellationToken);
        var waiting = ExecuteAsync(gateway, cookie);
        await Task.Delay(500, TestContext.CancellationToken);
        Assert.IsFalse(waiting.IsCompleted, "an expired token is not sent: the request waits for the renewal");
        gateway.Identity.HoldRefreshAnswer.SetResult();

        var first = await renewing.WaitAsync(TimeSpan.FromSeconds(30), TestContext.CancellationToken);
        var second = await waiting.WaitAsync(TimeSpan.FromSeconds(30), TestContext.CancellationToken);
        Assert.AreEqual(first, second, "both go on with the renewed token");
        Assert.AreEqual(1, gateway.Identity.Refreshes);
    }

    [TestMethod]
    public async Task ExecuteAsync_SendsTheTokenThatStillWorks_WhileALeaseIsHeld_AndRenewsOnceTheLeaseRunsOut()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromMinutes(15);

        // Another gateway instance is renewing: the token still works, so it is sent, and nothing renews twice.
        await SetLeaseAsync(gateway, "now() + interval '15 seconds'");
        await ExecuteAsync(gateway, cookie);
        Assert.AreEqual(0, gateway.Identity.Refreshes);

        // That instance stopped mid-renewal: its lease runs out (by the database's clock), and the next request renews.
        await SetLeaseAsync(gateway, "now() - interval '1 second'");
        await ExecuteAsync(gateway, cookie);
        Assert.AreEqual(1, gateway.Identity.Refreshes);
    }

    [TestMethod]
    public async Task ExecuteAsync_KeepsTheNewRefreshToken_WhenTheBrowserLeavesDuringTheRenewal()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromMinutes(15);
        gateway.Identity.HoldRefreshAnswer = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var leaving = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);

        var renewal = ExecuteAsync(gateway, cookie, leaving.Token);
        await gateway.Identity.RefreshReplaced.Task.WaitAsync(TimeSpan.FromSeconds(30), TestContext.CancellationToken);
        // The browser leaves while identity-api's answer is on its way: it has already replaced refresh-1 with refresh-2.
        await leaving.CancelAsync();
        gateway.Identity.HoldRefreshAnswer.SetResult();
        await renewal.WaitAsync(TimeSpan.FromSeconds(30), TestContext.CancellationToken);

        Assert.AreEqual("refresh-2", await RefreshTokenAsync(gateway, cookie));
    }

    [TestMethod]
    public async Task ExecuteAsync_RecoversAnAnswerThatWasLost_WithTheSameReplacementInsideTheGrace()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromMinutes(15);
        gateway.Identity.LoseNextRefreshAnswer = true;

        // identity-api replaced refresh-1 with refresh-2, and the answer never arrived. The same request asks again at once,
        // inside the grace, and gets refresh-2: it does not wait for a next request, which might come after the grace.
        await ExecuteAsync(gateway, cookie);
        Assert.AreEqual("refresh-2", await RefreshTokenAsync(gateway, cookie));
        Assert.AreEqual(2, gateway.Identity.Refreshes);
        Assert.IsEmpty(gateway.Identity.Revoked, "the sign-in goes on");
    }

    [TestMethod]
    public async Task ExecuteAsync_RecoversARenewalWhoseAnswersWereAllLost_HoweverLateTheNextRequestComes()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromMinutes(15);
        // identity-api replaced refresh-1 with refresh-2, and both the answer and the retry's answer were lost.
        gateway.Identity.LoseRefreshAnswers = 2;
        await ExecuteAsync(gateway, cookie);
        Assert.AreEqual("refresh-1", await RefreshTokenAsync(gateway, cookie));

        // The next request comes long after the grace period (here: none at all). Its renewal key says it is the same
        // renewal, so it gets refresh-2 rather than ending the sign-in as a stolen copy would.
        gateway.Identity.Grace = TimeSpan.Zero;
        await ExecuteAsync(gateway, cookie);

        Assert.AreEqual("refresh-2", await RefreshTokenAsync(gateway, cookie));
        Assert.IsEmpty(gateway.Identity.Revoked, "the sign-in goes on");
    }

    [TestMethod]
    public async Task ExecuteAsync_SendsTheTokenThatStillWorks_WhenIdentityApiIsDown()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.IsDown = true;

        var accessToken = await ExecuteAsync(gateway, cookie);

        StringAssert.StartsWith(accessToken, "eyJ");
        await using var dbContext = gateway.NewDbContext();
        Assert.IsNull((await dbContext.Sessions.SingleAsync(TestContext.CancellationToken)).RenewingUntil, "the lease is given back");
    }

    [TestMethod]
    public async Task ExecuteAsync_ThrowsUnavailable_WhenTheTokenHasExpiredAndIdentityApiIsDown()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(-5);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.IsDown = true;

        await Assert.ThrowsExactlyAsync<IdentityUnavailableException>(() => ExecuteAsync(gateway, cookie));
    }

    [TestMethod]
    public async Task ExecuteAsync_EndsTheSession_WhenIdentityApiEndedTheSignIn()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.EndAll();

        Assert.IsNull(await ExecuteAsync(gateway, cookie));

        await using var dbContext = gateway.NewDbContext();
        Assert.AreEqual(0, await dbContext.Sessions.CountAsync(TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task ExecuteAsync_GivesNothing_ForACookieWithNoSession()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);

        Assert.IsNull(await ExecuteAsync(gateway, SessionSecrets.NewValue()));
    }

    /// <summary>The handler as one request of the gateway runs it: in a scope of its own.</summary>
    private async Task<string?> ExecuteAsync(GatewayUnderTest gateway, string cookie, CancellationToken? cancellationToken = null)
    {
        await using var scope = gateway.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IGetAccessTokenCommandHandler>()
            .ExecuteAsync(cookie, _caller, cancellationToken ?? TestContext.CancellationToken);
    }

    private async Task<string?> RefreshTokenAsync(GatewayUnderTest gateway, string cookie)
    {
        await using var dbContext = gateway.NewDbContext();
        var session = await dbContext.Sessions.SingleAsync(TestContext.CancellationToken);
        return SessionSecrets.Open(cookie, session.Tokens)?.RefreshToken;
    }

    private async Task SetLeaseAsync(GatewayUnderTest gateway, string until)
    {
        await using var dbContext = gateway.NewDbContext();
#pragma warning disable EF1002 // The value is a fixed SQL expression of this test, not input.
        await dbContext.Database.ExecuteSqlRawAsync($"UPDATE sessions SET renewing_until = {until}", TestContext.CancellationToken);
#pragma warning restore EF1002
    }
}
