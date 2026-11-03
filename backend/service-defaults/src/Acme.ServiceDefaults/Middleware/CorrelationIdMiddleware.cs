using System.Diagnostics;

namespace Acme.ServiceDefaults.Middleware;

/// <summary>
/// Gives every request a correlation id: the caller's <c>x-correlation-id</c> if it sent one, otherwise the trace id.
/// The id is echoed in the response, tagged on the trace, and attached to every log written during the request.
/// </summary>
public sealed class CorrelationIdMiddleware
{
    public const string HeaderName = "x-correlation-id";
    private const int MaxLength = 128;

    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        string correlationId = ResolveCorrelationId(context);
        context.Items[HeaderName] = correlationId;
        Activity.Current?.SetTag("correlation.id", correlationId);
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = correlationId;
            return Task.CompletedTask;
        });

        using (_logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
        {
            await _next(context);
        }
    }

    private static string ResolveCorrelationId(HttpContext context)
    {
        var incoming = context.Request.Headers[HeaderName].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(incoming) && incoming.Length <= MaxLength)
        {
            return incoming;
        }

        return Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;
    }
}
