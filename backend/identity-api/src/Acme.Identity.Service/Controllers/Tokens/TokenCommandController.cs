using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Refresh;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Revoke;
using Acme.Identity.DTO.Tokens;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.Tokens;

[AllowAnonymous]
public sealed class TokenCommandController : ApiControllerBase
{
    private readonly ICreateTokenCommandHandler _createTokenCommandHandler;
    private readonly IRefreshTokenCommandHandler _refreshTokenCommandHandler;
    private readonly IRevokeTokenCommandHandler _revokeTokenCommandHandler;

    public TokenCommandController(
        ICreateTokenCommandHandler createTokenCommandHandler,
        IRefreshTokenCommandHandler refreshTokenCommandHandler,
        IRevokeTokenCommandHandler revokeTokenCommandHandler)
    {
        _createTokenCommandHandler = createTokenCommandHandler;
        _refreshTokenCommandHandler = refreshTokenCommandHandler;
        _revokeTokenCommandHandler = revokeTokenCommandHandler;
    }

    [HttpPost("v1/tokens")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<TokenCreateResponseDto>> CreateAsync([FromBody] TokenCreateRequestDto request, CancellationToken cancellationToken) =>
        await _createTokenCommandHandler.ExecuteAsync(request, cancellationToken);

    /// <summary>A new access token for a refresh token that is still good: the person's roles and locations as they are now.</summary>
    [HttpPost("v1/tokens/refresh")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<TokenRefreshResponseDto>> RefreshAsync([FromBody] TokenRefreshRequestDto request, CancellationToken cancellationToken) =>
        await _refreshTokenCommandHandler.ExecuteAsync(request, cancellationToken);

    /// <summary>Signing out: the refresh token ends. 204 whether or not it was a live one.</summary>
    [HttpPost("v1/tokens/revoke")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RevokeAsync([FromBody] TokenRevokeRequestDto request, CancellationToken cancellationToken)
    {
        await _revokeTokenCommandHandler.ExecuteAsync(request, cancellationToken);
        return NoContent();
    }
}
