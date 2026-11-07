using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Create;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Delete;
using Acme.Gateway.DTO.Sessions;
using Acme.Gateway.Service.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Gateway.Service.Controllers.Sessions;

/// <summary>
/// Signing in and out, for the browser. The browser never holds a token: signing in keeps what identity-api issues in a session
/// at the gateway, with only the session's cookie in the browser; signing out deletes the session. Both must come from the
/// app's own pages (the session middleware checks the header before this runs).
/// </summary>
[ApiController]
[Route(SessionPaths.Session)]
public sealed class SessionCommandController : ControllerBase
{
    private readonly ICreateSessionCommandHandler _createSessionCommandHandler;
    private readonly IDeleteSessionCommandHandler _deleteSessionCommandHandler;
    private readonly IHostEnvironment _environment;

    public SessionCommandController(
        ICreateSessionCommandHandler createSessionCommandHandler,
        IDeleteSessionCommandHandler deleteSessionCommandHandler,
        IHostEnvironment environment)
    {
        _createSessionCommandHandler = createSessionCommandHandler;
        _deleteSessionCommandHandler = deleteSessionCommandHandler;
        _environment = environment;
    }

    /// <summary>
    /// 204 and a session cookie when the password is right; otherwise identity-api's own answer (400, 401, or 429 with
    /// <c>Retry-After</c>), as it gave it. identity-api unavailable: 503 (<c>GatewayExceptionHandler</c>).
    /// </summary>
    [HttpPost]
    public async Task<ActionResult> CreateAsync(SessionCreateRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _createSessionCommandHandler.ExecuteAsync(
            request,
            SessionCookie.ValueOf(Request, _environment),
            CallerContextFactory.From(HttpContext),
            cancellationToken);
        if (result.Refusal is { } refusal)
        {
            return new IdentityRefusalResult(refusal);
        }

        SessionCookie.Set(Response, _environment, result.CookieValue!);
        return NoContent();
    }

    /// <summary>
    /// Always 204: the session is deleted (if there was one) and the cookie removed. It does not ask the browser to clear its
    /// cache: a browser holds that answer back until it has cleared, which on a well-used one takes seconds, and the page
    /// waits for this answer. <see cref="ForgetCache"/> does that, on a request nobody waits for.
    /// </summary>
    [HttpDelete]
    public async Task<ActionResult> DeleteAsync(CancellationToken cancellationToken)
    {
        if (SessionCookie.ValueOf(Request, _environment) is { } value)
        {
            await _deleteSessionCommandHandler.ExecuteAsync(value, CallerContextFactory.From(HttpContext), cancellationToken);
        }

        SessionCookie.Clear(Response, _environment);
        return NoContent();
    }

    /// <summary>
    /// <c>DELETE /api/session/cache</c>, always 204: asks the browser to drop what it cached (<c>Clear-Site-Data</c>), so a
    /// shared computer shows the next person nothing. The sign-in page sends it whenever nobody is signed in, and does not
    /// wait for it: the browser may take seconds to clear.
    /// </summary>
    [HttpDelete("cache")]
    public ActionResult ForgetCache()
    {
        Response.Headers["Clear-Site-Data"] = "\"cache\"";
        return NoContent();
    }
}
