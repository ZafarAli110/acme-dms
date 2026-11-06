using Acme.ServiceDefaults.ProblemDetails;

namespace Acme.Gateway.Sessions;

/// <summary>What the sign-in form sends.</summary>
internal sealed record SignInRequest(string Email, string Password);

/// <summary>
/// Signing in and out, for the browser. The browser never holds a token: signing in checks the password at identity-api and
/// keeps what it issues in a session here (<see cref="SessionStore"/>), with only the session's id in an httpOnly cookie;
/// signing out deletes the session, which ends the sign-in at once, everywhere.
/// </summary>
internal static partial class SessionEndpoints
{
    public const string Path = "/api/session";

    /// <summary>Ending the sign-in at identity-api too must never hold a sign-out: the session is already gone.</summary>
    private static readonly TimeSpan _revokeWait = TimeSpan.FromSeconds(3);

    public static void MapSessionEndpoints(this WebApplication app)
    {
        app.MapPost(Path, SignInAsync);
        app.MapDelete(Path, SignOutAsync);
    }

    /// <summary>
    /// 204 and a session cookie when the password is right; otherwise identity-api's own answer (401, or 429 with
    /// <c>Retry-After</c>), as it gave it.
    /// </summary>
    private static async Task SignInAsync(
        HttpContext context,
        IdentityClient identityClient,
        SessionStore sessions,
        IHostEnvironment environment,
        ILogger<SessionStore> logger)
    {
        if (!SessionCookie.IsFromThePage(context.Request))
        {
            await SessionProblems.WriteAsync(context, StatusCodes.Status403Forbidden, SessionProblems.NotFromThePage);
            return;
        }

        // Read after the check above: a request from elsewhere is refused before anything of it is used.
        var body = context.Request.HasJsonContentType()
            ? await context.Request.ReadFromJsonAsync<SignInRequest>(context.RequestAborted)
            : null;
        if (body is null)
        {
            await SessionProblems.WriteAsync(context, StatusCodes.Status400BadRequest, SessionProblems.NoCredentials);
            return;
        }

        SignInResult result;
        try
        {
            result = await identityClient.SignInAsync(body.Email, body.Password, context, context.RequestAborted);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException && !context.RequestAborted.IsCancellationRequested)
        {
            await SessionProblems.WriteAsync(context, StatusCodes.Status503ServiceUnavailable, SessionProblems.IdentityUnavailable);
            return;
        }

        if (result.Refusal is { } refusal)
        {
            using (refusal)
            {
                await PassOnAsync(refusal, context);
            }

            return;
        }

        // A sign-in replaces the one this browser had: that session ends, so a copy of its cookie signs no one in afterwards.
        var replaced = context.Request.Cookies.TryGetValue(SessionCookie.Name, out var previous) && previous.Length > 0
            ? await sessions.EndAsync(previous, context.RequestAborted)
            : null;
        var value = await sessions.CreateAsync(result.Tokens!, context.RequestAborted);
        SessionCookie.Set(context.Response, environment, value);
        context.Response.StatusCode = StatusCodes.Status204NoContent;
        if (replaced is not null)
        {
            await RevokeQuietlyAsync(identityClient, replaced, context, logger);
        }
    }

    /// <summary>
    /// Always 204: the session is deleted (if there was one) and the cookie removed, and then identity-api is asked to end the
    /// refresh token too. That last step can fail without harm: nothing outside the deleted session ever had that token.
    /// </summary>
    private static async Task SignOutAsync(
        HttpContext context,
        IdentityClient identityClient,
        SessionStore sessions,
        IHostEnvironment environment,
        ILogger<SessionStore> logger)
    {
        if (!SessionCookie.IsFromThePage(context.Request))
        {
            await SessionProblems.WriteAsync(context, StatusCodes.Status403Forbidden, SessionProblems.NotFromThePage);
            return;
        }

        string? refreshToken = null;
        if (context.Request.Cookies.TryGetValue(SessionCookie.Name, out var value) && value.Length > 0)
        {
            refreshToken = await sessions.EndAsync(value, context.RequestAborted);
        }

        SessionCookie.Clear(context.Response, environment);
        // What the browser kept of this person (cached answers) goes too: a shared computer shows the next person nothing.
        context.Response.Headers["Clear-Site-Data"] = "\"cache\"";
        context.Response.StatusCode = StatusCodes.Status204NoContent;
        if (refreshToken is not null)
        {
            await RevokeQuietlyAsync(identityClient, refreshToken, context, logger);
        }
    }

    /// <summary>Ends a refresh token at identity-api, waiting a little at most: its session is already gone, so a failure is harmless.</summary>
    private static async Task RevokeQuietlyAsync(IdentityClient identityClient, string refreshToken, HttpContext context, ILogger logger)
    {
        using var wait = new CancellationTokenSource(_revokeWait);
        try
        {
            await identityClient.RevokeAsync(refreshToken, context, wait.Token);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException)
        {
            LogRevokeFailed(logger, exception);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "identity-api could not end the refresh token of an ended session; the session is gone")]
    private static partial void LogRevokeFailed(ILogger logger, Exception exception);

    /// <summary>identity-api's refusal, unchanged: status, body and the headers the page reads.</summary>
    private static async Task PassOnAsync(HttpResponseMessage refusal, HttpContext context)
    {
        context.Response.StatusCode = (int)refusal.StatusCode;
        if (refusal.Headers.RetryAfter is { } retryAfter)
        {
            context.Response.Headers.RetryAfter = retryAfter.ToString();
        }

        if (refusal.Content.Headers.ContentType is { } contentType)
        {
            context.Response.ContentType = contentType.ToString();
        }

        await refusal.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
    }
}

/// <summary>The gateway's own refusals, in the problem-details shape every service answers with.</summary>
internal static class SessionProblems
{
    public const string NotFromThePage = "This request must come from the app's own pages.";
    public const string Ended = "The sign-in has ended.";
    public const string NoCredentials = "Send the email and password as JSON.";
    public const string IdentityUnavailable = "Signing in is unavailable right now. Try again shortly.";

    /// <summary>
    /// Marks the gateway's own "the sign-in has ended" 401: the page ends its sign-in on this one only. A 401 from a service
    /// (a token it refused while the session lives) is an error to show, not a reason to sign the person out.
    /// </summary>
    public const string EndedHeader = "X-Acme-Session";
    public const string EndedHeaderValue = "ended";

    public static Task WriteEndedAsync(HttpContext context)
    {
        context.Response.Headers[EndedHeader] = EndedHeaderValue;
        return WriteAsync(context, StatusCodes.Status401Unauthorized, Ended);
    }

    public static Task WriteAsync(HttpContext context, int status, string detail)
    {
        context.Response.StatusCode = status;
        var problem = ProblemDetailsDtoFactory.CreateWithSafeDetail(context, status, detail);
        return context.Response.WriteAsJsonAsync(problem, (System.Text.Json.JsonSerializerOptions?)null, "application/problem+json", context.RequestAborted);
    }
}
