using System.Net;
using System.Net.Http.Json;
using Acme.Gateway.Tests.Support;

namespace Acme.Gateway.Tests.Middleware;

/// <summary>Each sign-in has its own share of requests: past it the gateway answers 429 itself, and nobody else is slowed.</summary>
[TestClass]
public sealed class PerUserRateLimitTests
{
    private static readonly Uri _customers = new("/api/dealership/v1/customers", UriKind.Relative);

    /// <summary>A share of three requests, refilled at one a second: small enough to run out of inside a test.</summary>
    private static readonly Dictionary<string, string> _smallShare = new()
    {
        ["RateLimit:Burst"] = "3",
        ["RateLimit:RequestsPerSecond"] = "1",
    };

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task RateLimiter_Answers429WithRetryAfter_WhenASignInGoesOverItsShare()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(_smallShare, TestContext.CancellationToken);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        using var browser = gateway.NewClient();

        var statuses = new List<HttpStatusCode>();
        for (var attempt = 0; attempt < 6; attempt++)
        {
            using var response = await SendAsync(browser, cookie);
            statuses.Add(response.StatusCode);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                Assert.IsTrue(response.Headers.RetryAfter?.Delta >= TimeSpan.FromSeconds(1));
                var problem = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>(TestContext.CancellationToken);
                Assert.AreEqual(429, int.Parse(problem!["status"].ToString()!, System.Globalization.CultureInfo.InvariantCulture));
            }
        }

        // The sign-in itself was the first of the three.
        CollectionAssert.Contains(statuses, HttpStatusCode.TooManyRequests);
        Assert.IsTrue(gateway.Service.Authorizations.Count < 6, "a refused request must not reach the service");
    }

    [TestMethod]
    public async Task RateLimiter_LetsAnotherSignInThrough_WhenOneIsOverItsShare()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(_smallShare, TestContext.CancellationToken);
        var busy = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        using var other = gateway.NewClient();
        var calm = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        using var browser = gateway.NewClient();
        for (var attempt = 0; attempt < 6; attempt++)
        {
            using var _ = await SendAsync(browser, busy);
        }

        using var response = await SendAsync(other, calm);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
    }

    [TestMethod]
    public async Task RateLimiter_Answers429_WhenOneAddressSendsANewMadeUpCookieEachTime()
    {
        var settings = new Dictionary<string, string>
        {
            ["RateLimit:AddressBurst"] = "3",
            ["RateLimit:AddressRequestsPerSecond"] = "1",
        };
        await using var gateway = await GatewayUnderTest.NewAsync(settings, TestContext.CancellationToken);
        using var flood = gateway.NewClient();

        var statuses = new List<HttpStatusCode>();
        for (var attempt = 0; attempt < 6; attempt++)
        {
            using var response = await SendAsync(flood, Guid.NewGuid().ToString("N"));
            statuses.Add(response.StatusCode);
        }

        // Each made-up cookie is a new sign-in bucket, but every request comes from the same address.
        CollectionAssert.Contains(statuses, HttpStatusCode.TooManyRequests);
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, string cookie)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, _customers);
        request.Headers.Add("Cookie", $"{GatewayUnderTest.CookieName}={cookie}");
        return await client.SendAsync(request);
    }
}
