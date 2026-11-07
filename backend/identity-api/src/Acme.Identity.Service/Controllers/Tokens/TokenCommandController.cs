using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Refresh;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Revoke;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Service.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Acme.Identity.Service.Controllers.Tokens;

[AllowAnonymous]
public sealed class TokenCommandController : ApiControllerBase
{
    private readonly ICreateTokenCommandHandler _createTokenCommandHandler;
    private readonly IRefreshTokenCommandHandler _refreshTokenCommandHandler;
    private readonly IRevokeTokenCommandHandler _revokeTokenCommandHandler;
    private readonly IHostEnvironment _environment;

    public TokenCommandController(
        ICreateTokenCommandHandler createTokenCommandHandler,
        IRefreshTokenCommandHandler refreshTokenCommandHandler,
        IRevokeTokenCommandHandler revokeTokenCommandHandler,
        IHostEnvironment environment)
    {
        _createTokenCommandHandler = createTokenCommandHandler;
        _refreshTokenCommandHandler = refreshTokenCommandHandler;
        _revokeTokenCommandHandler = revokeTokenCommandHandler;
        _environment = environment;
    }

    /// <summary>Signing in: the access token in the body, the refresh token in an httpOnly cookie.</summary>
    [EnableRateLimiting(RateLimits.SignIn)]
    [HttpPost("v1/tokens")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<TokenCreateResponseDto>> CreateAsync([FromBody] TokenCreateRequestDto request, CancellationToken cancellationToken)
    {
        var issued = await _createTokenCommandHandler.ExecuteAsync(request, cancellationToken);
        RefreshCookie.Set(Response, _environment, issued.RefreshToken!);
        return issued.Response;
    }

    /// <summary>
    /// A new access token for the cookie's refresh token, which the new cookie replaces. The person's roles and locations
    /// are read again. 401 ends the sign-in: the cookie is gone, unknown, ended, or was used twice.
    /// </summary>
    [EnableRateLimiting(RateLimits.Token)]
    [HttpPost("v1/tokens/refresh")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<TokenCreateResponseDto>> RefreshAsync(CancellationToken cancellationToken)
    {
        RequireThePage();
        // The gateway's renewal key: the same until a renewal of this sign-in succeeds (a bounded string, or ignored).
        var renewalKey = Request.Headers["Idempotency-Key"].FirstOrDefault();
        if (renewalKey is { Length: > 100 })
        {
            renewalKey = null;
        }

        var issued = await _refreshTokenCommandHandler.ExecuteAsync(Request.Cookies[RefreshCookie.Name], renewalKey, cancellationToken);
        if (issued.RefreshToken is not null)
        {
            RefreshCookie.Set(Response, _environment, issued.RefreshToken);
        }

        return issued.Response;
    }

    /// <summary>Signing out: the sign-in ends everywhere and the cookie is removed. 204 whether or not it was an open one.</summary>
    [EnableRateLimiting(RateLimits.Token)]
    [HttpPost("v1/tokens/revoke")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RevokeAsync(CancellationToken cancellationToken)
    {
        RequireThePage();
        await _revokeTokenCommandHandler.ExecuteAsync(Request.Cookies[RefreshCookie.Name], cancellationToken);
        RefreshCookie.Clear(Response, _environment);
        return NoContent();
    }

    private void RequireThePage()
    {
        if (Request.Headers[RefreshCookie.RequiredHeader] != RefreshCookie.RequiredHeaderValue)
        {
            throw new ApiException(ApiErrorCategory.Forbidden, $"The {RefreshCookie.RequiredHeader} header is required.");
        }
    }
}
