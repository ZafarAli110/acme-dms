using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.GetAccessToken;
using Acme.Gateway.Service.Authorization;
using Microsoft.Net.Http.Headers;

namespace Acme.Gateway.Service.Middleware;

/// <summary>
/// Turns the browser's session cookie into the access token the services check. A request to <c>/api/…</c> with the cookie is
/// sent on with <c>Authorization: Bearer</c> (the session's token, renewed first when it is about to expire) and without the
/// cookie; one whose session is gone gets a 401 and loses the cookie, and so does one from the app's own page with no cookie at all.
/// A request without the cookie from anything else (a script with its own token) is sent on as it came. A request that changes something, and every sign-in and sign-out, must carry the header only the
/// app's own pages add. identity-api being unavailable is answered by <see cref="GatewayExceptionHandler"/>.
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

    public async Task InvokeAsync(HttpContext context, IGetAccessTokenCommandHandler getAccessTokenCommandHandler)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(getAccessTokenCommandHandler);
        var request = context.Request;
        if (request.Path.StartsWithSegments(SessionPaths.Session))
        {
            if (!SessionCookie.IsFromThePage(request))
            {
                await SessionProblems.WriteAsync(context, StatusCodes.Status403Forbidden, SessionProblems.NotFromThePage);
                return;
            }

            await _next(context);
            return;
        }

        if (!request.Path.StartsWithSegments(SessionPaths.Api))
        {
            await _next(context);
            return;
        }

        var value = SessionCookie.ValueOf(request, _environment);
        if (value is null)
        {
            // The app's own page with no session cookie has no sign-in (the cookie was cleared or ran out): the same marked
            // 401 as a session that has ended, so the page signs the tab out instead of showing a service's refusal. A script
            // has no page header and its own token, and goes on as it came.
            if (SessionCookie.IsFromThePage(request) && !request.Headers.ContainsKey(HeaderNames.Authorization))
            {
                await SessionProblems.WriteEndedAsync(context);
                return;
            }

            await _next(context);
            return;
        }

        if (!IsSafe(request.Method) && !SessionCookie.IsFromThePage(request))
        {
            await SessionProblems.WriteAsync(context, StatusCodes.Status403Forbidden, SessionProblems.NotFromThePage);
            return;
        }

        var accessToken = await getAccessTokenCommandHandler.ExecuteAsync(value, CallerContextFactory.From(context), context.RequestAborted);
        if (accessToken is null)
        {
            SessionCookie.Clear(context.Response, _environment);
            await SessionProblems.WriteEndedAsync(context);
            return;
        }

        request.Headers.Authorization = $"Bearer {accessToken}";
        WithoutTheSessionCookie(request, SessionCookie.NameFor(_environment));
        await _next(context);
    }

    private static bool IsSafe(string method) =>
        HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);

    /// <summary>
    /// The services get the access token, never the session cookie: its value is the key to the session's tokens, so it stays
    /// between the browser and the gateway (a service that logs headers would otherwise hold it). Other cookies go on.
    /// </summary>
    private static void WithoutTheSessionCookie(HttpRequest request, string cookieName)
    {
        var prefix = cookieName + "=";
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
}
