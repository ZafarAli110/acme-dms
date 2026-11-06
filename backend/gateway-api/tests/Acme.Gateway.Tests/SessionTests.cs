using System.Net;
using System.Text;
using Acme.Gateway.Sessions;
using Acme.Gateway.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace Acme.Gateway.Tests;

/// <summary>
/// The gateway as the browser's backend: the browser holds a session cookie and never a token; the gateway sends the session's
/// access token on, renews it, and ends the sign-in at once on sign-out.
/// </summary>
[TestClass]
public sealed class SessionTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task SignIn_GivesAnHttpOnlyCookie_AndTheBrowserNoToken()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);

        using var response = await gateway.SignInAsync("right", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.NoContent, response.StatusCode);
        var cookie = response.Headers.GetValues("Set-Cookie").Single();
        StringAssert.StartsWith(cookie, "acme_session=");
        StringAssert.Contains(cookie, "httponly");
        StringAssert.Contains(cookie, "samesite=strict");
        StringAssert.Contains(cookie, "path=/api");
        Assert.AreEqual(0, response.Content.Headers.ContentLength ?? 0);
    }

    [TestMethod]
    public async Task TheSessionsTable_HoldsNoTokenAnyoneCanUse()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);
        using var signedIn = await gateway.SignInAsync("right", TestContext.CancellationToken);
        var cookieValue = signedIn.Headers.GetValues("Set-Cookie").Single().Split(';')[0]["acme_session=".Length..];

        await using var dbContext = gateway.NewDbContext();
        var session = await dbContext.Sessions.SingleAsync(TestContext.CancellationToken);

        Assert.AreNotEqual(cookieValue, session.Id);
        Assert.AreEqual(SessionCookie.IdOf(cookieValue), session.Id);
        var stored = Encoding.UTF8.GetString(session.Tokens);
        Assert.DoesNotContain("refresh-1", stored);
        Assert.DoesNotContain("eyJ", stored);
        Assert.IsNull(SessionCookie.Open(SessionCookie.NewValue(), session.Tokens), "another cookie value cannot open the tokens");
        Assert.AreEqual("refresh-1", SessionCookie.Open(cookieValue, session.Tokens)?.RefreshToken);
        Assert.AreEqual(FakeIdentity.UserId, session.UserId);
    }

    [TestMethod]
    public async Task ARequestWithTheCookie_ReachesTheServiceWithTheSessionsAccessToken()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);
        using var signedIn = await gateway.SignInAsync("right", TestContext.CancellationToken);

        using var response = await gateway.Browser.GetAsync(new Uri("/api/dealership/v1/customers", UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        StringAssert.StartsWith(gateway.Service.Authorizations.Single(), "Bearer eyJ");
    }

    [TestMethod]
    public async Task ARequestWithoutTheCookie_IsSentOnAsItCame_SoScriptsKeepTheirOwnTokens()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);
        using var script = gateway.NewClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/dealership/v1/customers");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "a-scripts-token");

        using var response = await script.SendAsync(request, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("Bearer a-scripts-token", gateway.Service.Authorizations.Single());
    }

    [TestMethod]
    public async Task AWrongPassword_GetsIdentityApisOwnAnswer_AndNoCookie()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);

        using var response = await gateway.SignInAsync("wrong", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.AreEqual("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        StringAssert.Contains(await response.Content.ReadAsStringAsync(TestContext.CancellationToken), "Wrong email or password.");
        Assert.IsFalse(response.Headers.Contains("Set-Cookie"));
    }

    [TestMethod]
    public async Task SigningOut_EndsTheSessionAtOnce_AndTheRefreshTokenAtIdentityApi()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);
        using var signedIn = await gateway.SignInAsync("right", TestContext.CancellationToken);
        var cookie = signedIn.Headers.GetValues("Set-Cookie").Single().Split(';')[0];

        using var signOut = await gateway.Browser.SendAsync(GatewayUnderTest.FromThePage(HttpMethod.Delete, "/api/session"), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.NoContent, signOut.StatusCode);
        Assert.AreEqual("refresh-1", gateway.Identity.Revoked.Single());
        // The old cookie, kept by someone who copied it: refused on the very next request, not after the token's 15 minutes.
        using var copy = gateway.NewClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/dealership/v1/customers");
        request.Headers.Add("Cookie", cookie);
        using var afterwards = await copy.SendAsync(request, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Unauthorized, afterwards.StatusCode);
        Assert.IsEmpty(gateway.Service.Authorizations);
    }

    [TestMethod]
    public async Task ARequestThatChangesSomething_MustComeFromTheAppsOwnPages()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);
        using var signedIn = await gateway.SignInAsync("right", TestContext.CancellationToken);

        using var forged = await gateway.Browser.PostAsync(new Uri("/api/dealership/v1/customers", UriKind.Relative), null, TestContext.CancellationToken);
        using var read = await gateway.Browser.GetAsync(new Uri("/api/dealership/v1/customers", UriKind.Relative), TestContext.CancellationToken);
        using var own = await gateway.Browser.SendAsync(GatewayUnderTest.FromThePage(HttpMethod.Post, "/api/dealership/v1/customers"), TestContext.CancellationToken);
        using var signInFromElsewhere = await gateway.Browser.PostAsync(new Uri("/api/session", UriKind.Relative), null, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.Forbidden, forged.StatusCode);
        Assert.AreEqual(HttpStatusCode.OK, read.StatusCode);
        Assert.AreEqual(HttpStatusCode.OK, own.StatusCode);
        Assert.AreEqual(HttpStatusCode.Forbidden, signInFromElsewhere.StatusCode);
    }

    [TestMethod]
    public async Task AnAccessTokenAboutToExpire_IsRenewedOnce_HoweverManyRequestsFindItAtOnce()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        using var signedIn = await gateway.SignInAsync("right", TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromMinutes(15);

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            gateway.Browser.GetAsync(new Uri("/api/dealership/v1/customers", UriKind.Relative), TestContext.CancellationToken)));

        Assert.IsTrue(responses.All(response => response.StatusCode == HttpStatusCode.OK));
        Assert.AreEqual(1, gateway.Identity.Refreshes);
        Assert.AreEqual(1, gateway.Service.Authorizations.Distinct().Count(), "every request went on with the one renewed token");
        Assert.IsTrue(gateway.Identity.ForwardedFor.All(address => address == GatewayUnderTest.BrowserAddress), "identity-api counts the browser, not the gateway");
        foreach (var response in responses)
        {
            response.Dispose();
        }
    }

    [TestMethod]
    public async Task ASignInIdentityApiEnded_EndsTheSessionToo()
    {
        await using var gateway = await TestGateway.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(30);
        using var signedIn = await gateway.SignInAsync("right", TestContext.CancellationToken);
        gateway.Identity.EndAll();

        using var response = await gateway.Browser.GetAsync(new Uri("/api/dealership/v1/customers", UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        StringAssert.StartsWith(response.Headers.GetValues("Set-Cookie").Single(), "acme_session=;");
        await using var dbContext = gateway.NewDbContext();
        Assert.AreEqual(0, await dbContext.Sessions.CountAsync(TestContext.CancellationToken));
    }
}
