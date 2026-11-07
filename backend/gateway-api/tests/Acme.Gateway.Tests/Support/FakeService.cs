using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;

namespace Acme.Gateway.Tests.Support;

/// <summary>Every service behind the gateway: answers 200 and remembers the Authorization and Cookie headers each request had.</summary>
internal sealed class FakeService : HttpMessageHandler
{
    public ConcurrentQueue<string?> Authorizations { get; } = new();

    public ConcurrentQueue<string?> Cookies { get; } = new();

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Authorizations.Enqueue(request.Headers.Authorization?.ToString());
        Cookies.Enqueue(request.Headers.TryGetValues("Cookie", out var cookies) ? string.Join("; ", cookies) : null);
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { ok = true }) });
    }
}
