using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.GetAccessToken;
using Acme.Gateway.DTO.Sessions;
using Acme.Gateway.Service.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Gateway.Service.Controllers.Sessions;

/// <summary>
/// Whether the browser is signed in, for the app's own pages. Asking a service "who am I" with no sign-in is answered 401,
/// which the browser logs as an error on every signed-out visit; this answers 200 either way.
/// </summary>
[ApiController]
[Route(SessionPaths.Session)]
public sealed class SessionController : ControllerBase
{
    private readonly IGetAccessTokenCommandHandler _getAccessTokenCommandHandler;

    public SessionController(IGetAccessTokenCommandHandler getAccessTokenCommandHandler)
    {
        _getAccessTokenCommandHandler = getAccessTokenCommandHandler;
    }

    /// <summary>
    /// 200 with <c>isSignedIn</c>: true while the session cookie names a session that can still give an access token (renewed
    /// first if it is about to expire), false with no cookie or a session that has ended, whose cookie is then removed.
    /// identity-api unavailable while renewing: 503 (<c>GatewayExceptionHandler</c>).
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<SessionStatusDto>> GetAsync(CancellationToken cancellationToken)
    {
        if (SessionCookie.ValueOf(Request) is not { } value)
        {
            return new SessionStatusDto(false);
        }

        var accessToken = await _getAccessTokenCommandHandler.ExecuteAsync(value, CallerContextFactory.From(HttpContext), cancellationToken);
        if (accessToken is null)
        {
            SessionCookie.Clear(Response);
        }

        return new SessionStatusDto(accessToken is not null);
    }
}
