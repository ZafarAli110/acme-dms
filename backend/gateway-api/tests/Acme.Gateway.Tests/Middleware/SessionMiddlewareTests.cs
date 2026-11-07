using System.Net;
using System.Net.Http.Headers;
using Acme.Gateway.Tests.Support;

namespace Acme.Gateway.Tests.Middleware;

/// <summary>
/// What reaches the services, and what the browser gets back, through the whole gateway: the session cookie becomes the access
/// token, a request from another site is refused, and a session that is gone is answered by the gateway itself.
/// </summary>
[TestClass]
public sealed class SessionMiddlewareTests
{
    private static readonly Uri _customers = new("/api/dealership/v1/customers", UriKind.Relative);

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task InvokeAsync_SendsTheSessionsAccessTokenOn_WithoutTheSessionCookie()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        using var browser = gateway.NewClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, _customers);
        request.Headers.Add("Cookie", $"theme=dark; {GatewayUnderTest.CookieName}={cookie}");

        using var response = await browser.SendAsync(request, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        StringAssert.StartsWith(gateway.Service.Authorizations.Single(), "Bearer eyJ");
        Assert.AreEqual("theme=dark", gateway.Service.Cookies.Single(), "the session cookie stays at the gateway");
    }

    [TestMethod]
    public async Task InvokeAsync_SendsARequestWithoutTheCookieOnAsItCame_SoScriptsKeepTheirOwnTokens()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        using var script = gateway.NewClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, _customers);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "a-scripts-token");

        using var response = await script.SendAsync(request, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("Bearer a-scripts-token", gateway.Service.Authorizations.Single());
    }

    [TestMethod]
    public async Task InvokeAsync_RefusesAChangeOrASignInWithoutThePagesHeader_AndLetsAReadThrough()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        using var signedIn = await gateway.SignInAsync("right", TestContext.CancellationToken);

        using var forged = await gateway.Browser.PostAsync(_customers, null, TestContext.CancellationToken);
        using var read = await gateway.Browser.GetAsync(_customers, TestContext.CancellationToken);
        using var own = await gateway.Browser.SendAsync(GatewayUnderTest.FromThePage(HttpMethod.Post, _customers.ToString()), TestContext.CancellationToken);
        using var signInFromElsewhere = await gateway.Browser.PostAsync(new Uri("/api/session", UriKind.Relative), null, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.Forbidden, forged.StatusCode);
        Assert.AreEqual(HttpStatusCode.OK, read.StatusCode);
        Assert.AreEqual(HttpStatusCode.OK, own.StatusCode);
        Assert.AreEqual(HttpStatusCode.Forbidden, signInFromElsewhere.StatusCode);
    }

    [TestMethod]
    public async Task InvokeAsync_AfterSigningOut_RefusesACopyOfTheCookie_WithTheGatewaysMarked401()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);

        using var signOut = await gateway.Browser.SendAsync(GatewayUnderTest.FromThePage(HttpMethod.Delete, "/api/session"), TestContext.CancellationToken);
        using var copy = gateway.NewClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, _customers);
        request.Headers.Add("Cookie", $"{GatewayUnderTest.CookieName}={cookie}");
        using var afterwards = await copy.SendAsync(request, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.NoContent, signOut.StatusCode);
        Assert.AreEqual(HttpStatusCode.Unauthorized, afterwards.StatusCode);
        Assert.AreEqual("ended", afterwards.Headers.GetValues("X-Acme-Session").Single(), "the page signs out on this 401 only");
        Assert.IsEmpty(gateway.Service.Authorizations);
    }

    [TestMethod]
    public async Task InvokeAsync_Answers503_WhenTheTokenHasExpiredAndIdentityApiIsDown()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.AccessTokenLifetime = TimeSpan.FromSeconds(-5);
        using var signedIn = await gateway.SignInAsync("right", TestContext.CancellationToken);
        gateway.Identity.IsDown = true;

        using var response = await gateway.Browser.GetAsync(_customers, TestContext.CancellationToken);
        using var signIn = await gateway.SignInAsync("right", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.AreEqual("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.AreEqual(HttpStatusCode.ServiceUnavailable, signIn.StatusCode);
    }
}
