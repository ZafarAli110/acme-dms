using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;

namespace Acme.Gateway.Tests.Support;

/// <summary>Every service behind the gateway: answers 200 and remembers the Authorization and Cookie headers each request had.</summary>
internal sealed class FakeService : HttpMessageHandler
{
    public ConcurrentQueue<string?> Authorizations { get; } = new();

    public ConcurrentQueue<string?> Cookies { get; } = new();

    /// <summary>How long each answer takes: a service that is stuck, for the gateway's time limit.</summary>
    public TimeSpan Delay { get; set; } = TimeSpan.Zero;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Authorizations.Enqueue(request.Headers.Authorization?.ToString());
        Cookies.Enqueue(request.Headers.TryGetValues("Cookie", out var cookies) ? string.Join("; ", cookies) : null);
        if (Delay > TimeSpan.Zero)
        {
            await Task.Delay(Delay, cancellationToken);
        }

        return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { ok = true }) };
    }
}
