namespace Acme.Gateway.Sessions;

/// <summary>
/// Turns the browser's session cookie into the access token the services check. A request to <c>/api/…</c> with the cookie is
/// sent on with <c>Authorization: Bearer</c> (the session's token, renewed first when it is about to expire); one whose session
/// is gone gets a 401 and loses the cookie. A request without the cookie (a script with its own token) is sent on as it came.
/// A request that changes something must also carry the header only the app's own pages add.
/// </summary>
internal sealed class SessionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IHostEnvironment _environment;

    public SessionMiddleware(RequestDelegate next, IHostEnvironment environment)
    {
        _next = next;
        _environment = environment;
    }

    public async Task InvokeAsync(HttpContext context, SessionStore sessions)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(sessions);
        var request = context.Request;
        var isForTheServices = request.Path.StartsWithSegments("/api") && !request.Path.StartsWithSegments(SessionEndpoints.Path);
        if (!isForTheServices || !request.Cookies.TryGetValue(SessionCookie.Name, out var value) || value.Length == 0)
        {
            await _next(context);
            return;
        }

        if (!IsSafe(request.Method) && !SessionCookie.IsFromThePage(request))
        {
            await SessionProblems.WriteAsync(context, StatusCodes.Status403Forbidden, SessionProblems.NotFromThePage);
            return;
        }

        string? accessToken;
        try
        {
            accessToken = await sessions.GetAccessTokenAsync(value, context, context.RequestAborted);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException && !context.RequestAborted.IsCancellationRequested)
        {
            await SessionProblems.WriteAsync(context, StatusCodes.Status503ServiceUnavailable, SessionProblems.IdentityUnavailable);
            return;
        }

        if (accessToken is null)
        {
            SessionCookie.Clear(context.Response, _environment);
            await SessionProblems.WriteEndedAsync(context);
            return;
        }

        request.Headers.Authorization = $"Bearer {accessToken}";
        WithoutTheSessionCookie(request);
        await _next(context);
    }

    /// <summary>
    /// The services get the access token, never the session cookie: its value is the key to the session's tokens, so it stays
    /// between the browser and the gateway (a service that logs headers would otherwise hold it). Other cookies go on.
    /// </summary>
    private static void WithoutTheSessionCookie(HttpRequest request)
    {
        var prefix = SessionCookie.Name + "=";
        var others = request.Headers.Cookie
            .SelectMany(header => (header ?? "").Split(';'))
            .Select(cookie => cookie.Trim())
            .Where(cookie => cookie.Length > 0 && !cookie.StartsWith(prefix, StringComparison.Ordinal))
            .ToArray();
        if (others.Length == 0)
        {
            request.Headers.Remove("Cookie");
        }
        else
        {
            request.Headers.Cookie = string.Join("; ", others);
        }
    }

    private static bool IsSafe(string method) =>
        HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
}
