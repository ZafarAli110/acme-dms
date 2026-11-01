using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Acme.Gateway.Tests;

/// <summary>The gateway in memory: its own GET /v1/system/health answers in the shape every service shares.</summary>
[TestClass]
public sealed class HealthEndpointTests
{
    private static readonly string[] _sharedShape = ["service", "status", "version", "databaseReachable"];

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task GetHealth_AnswersInTheSharedShape_WithNoDatabase()
    {
        await using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/v1/system/health", UriKind.Relative), TestContext.CancellationToken);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.CancellationToken));
        var body = json.RootElement;

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        CollectionAssert.AreEqual(_sharedShape, body.EnumerateObject().Select(property => property.Name).ToArray());
        Assert.AreEqual("gateway-api", body.GetProperty("service").GetString());
        Assert.AreEqual("ok", body.GetProperty("status").GetString());
        StringAssert.Matches(body.GetProperty("version").GetString(), new System.Text.RegularExpressions.Regex(@"^\d+\.\d+\.\d+$"));
        Assert.AreEqual(JsonValueKind.Null, body.GetProperty("databaseReachable").ValueKind);
    }

    [TestMethod]
    public async Task EveryResponse_ForbidsCaching()
    {
        await using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/v1/system/health", UriKind.Relative), TestContext.CancellationToken);

        Assert.IsTrue(response.Headers.CacheControl?.NoStore);
    }
}
