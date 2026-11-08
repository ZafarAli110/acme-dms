using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using Acme.Gateway.Tests.Support;

namespace Acme.Gateway.Tests.Middleware;

/// <summary>
/// A service that does not answer: the gateway gives up after its cluster's time limit (<c>HttpRequest.ActivityTimeout</c>,
/// 15 s in appsettings.json) and answers 504, instead of holding the request for YARP's default 100 s (ACME-121).
/// </summary>
[TestClass]
public sealed class ProxyTimeoutTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task Proxy_Answers504AfterItsTimeLimit_WhenAServiceDoesNotAnswer()
    {
        var settings = new Dictionary<string, string>
        {
            ["ReverseProxy:Clusters:dealership-api:HttpRequest:ActivityTimeout"] = "00:00:01",
        };
        await using var gateway = await GatewayUnderTest.NewAsync(settings, TestContext.CancellationToken);
        gateway.Service.Delay = TimeSpan.FromSeconds(30);
        using var script = gateway.NewClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri("/api/dealership/v1/customers", UriKind.Relative));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "a-scripts-token");

        var clock = Stopwatch.StartNew();
        using var response = await script.SendAsync(request, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.GatewayTimeout, response.StatusCode);
        Assert.IsTrue(clock.Elapsed < TimeSpan.FromSeconds(10), $"answered after {clock.Elapsed}, not after about 1 s");
    }
}
