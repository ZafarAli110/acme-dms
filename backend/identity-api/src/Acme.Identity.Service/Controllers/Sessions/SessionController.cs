using Acme.Identity.BusinessLogic.Abstractions.Handlers.Sessions.GetRevoked;
using Acme.Identity.DTO.Sessions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Acme.Identity.Service.Controllers.Sessions;

public sealed class SessionController : ApiControllerBase
{
    private readonly IGetRevokedSessionsQueryHandler _getRevokedSessionsQueryHandler;

    public SessionController(IGetRevokedSessionsQueryHandler getRevokedSessionsQueryHandler)
    {
        _getRevokedSessionsQueryHandler = getRevokedSessionsQueryHandler;
    }

    /// <summary>
    /// The sign-ins that ended since <c>since</c> (an instant; no more than the last access token lifetime is listed). The
    /// services ask every few seconds and refuse the access tokens (<c>sid</c>) of what comes back. Start from the
    /// <c>now</c> of the last answer.
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Feed)]
    [HttpGet("v1/sessions/revoked")]
    public async Task<ActionResult<RevokedSessionsResponseDto>> RevokedAsync([FromQuery] DateTimeOffset? since, CancellationToken cancellationToken) =>
        await _getRevokedSessionsQueryHandler.ExecuteAsync(since, cancellationToken);
}
