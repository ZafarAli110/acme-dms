using Acme.Gateway.BusinessLogic.Abstractions.Clients;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Create;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Delete;
using Acme.Gateway.DTO.Sessions;
using Acme.Gateway.Service.Authorization;
using Acme.Gateway.Service.Middleware;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Gateway.Service.Controllers.Sessions;

/// <summary>
/// Signing in and out, for the browser. The browser never holds a token: signing in keeps what identity-api issues in a session
/// at the gateway, with only the session's cookie in the browser; signing out deletes the session. Both must come from the
/// app's own pages (<see cref="SessionMiddleware"/> checks the header before this runs).
/// </summary>
[ApiController]
[Route(SessionPaths.Session)]
public sealed class SessionCommandController : ControllerBase
{
    private readonly ICreateSessionCommandHandler _createSession;
    private readonly IDeleteSessionCommandHandler _deleteSession;
    private readonly IHostEnvironment _environment;

    public SessionCommandController(ICreateSessionCommandHandler createSession, IDeleteSessionCommandHandler deleteSession, IHostEnvironment environment)
    {
        _createSession = createSession;
        _deleteSession = deleteSession;
        _environment = environment;
    }

    /// <summary>
    /// 204 and a session cookie when the password is right; otherwise identity-api's own answer (401, or 429 with
    /// <c>Retry-After</c>), as it gave it; 503 when identity-api cannot be reached.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateAsync(SessionCreateRequestDto request, CancellationToken cancellationToken)
    {
        CreateSessionResult result;
        try
        {
            result = await _createSession.ExecuteAsync(request, SessionCookie.ValueOf(Request), SessionProblems.CallerOf(HttpContext), cancellationToken);
        }
        catch (IdentityUnavailableException)
        {
            await SessionProblems.WriteAsync(HttpContext, StatusCodes.Status503ServiceUnavailable, SessionProblems.IdentityUnavailable);
            return new EmptyResult();
        }

        if (result.Refusal is { } refusal)
        {
            // identity-api's answer, unchanged: status, body and the headers the page reads.
            Response.StatusCode = refusal.Status;
            Response.ContentType = refusal.ContentType ?? "application/problem+json";
            if (refusal.RetryAfter is { } retryAfter)
            {
                Response.Headers.RetryAfter = retryAfter;
            }

            await Response.Body.WriteAsync(refusal.Body, cancellationToken);
            return new EmptyResult();
        }

        SessionCookie.Set(Response, _environment, result.CookieValue!);
        return NoContent();
    }

    /// <summary>
    /// Always 204: the session is deleted (if there was one), the cookie removed, and the browser told to drop what it cached
    /// (<c>Clear-Site-Data</c>), so a shared computer shows the next person nothing.
    /// </summary>
    [HttpDelete]
    public async Task<IActionResult> DeleteAsync(CancellationToken cancellationToken)
    {
        if (SessionCookie.ValueOf(Request) is { } value)
        {
            await _deleteSession.ExecuteAsync(value, SessionProblems.CallerOf(HttpContext), cancellationToken);
        }

        SessionCookie.Clear(Response, _environment);
        Response.Headers["Clear-Site-Data"] = "\"cache\"";
        return NoContent();
    }
}
