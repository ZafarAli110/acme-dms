using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;
using Acme.Identity.DTO.Tokens;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.Tokens;

[AllowAnonymous]
public sealed class TokenCommandController : ApiControllerBase
{
    private readonly ICreateTokenCommandHandler _createTokenCommandHandler;

    public TokenCommandController(ICreateTokenCommandHandler createTokenCommandHandler)
    {
        _createTokenCommandHandler = createTokenCommandHandler;
    }

    [HttpPost("v1/tokens")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<TokenCreateResponseDto>> CreateAsync([FromBody] TokenCreateRequestDto request, CancellationToken cancellationToken) =>
        await _createTokenCommandHandler.ExecuteAsync(request, cancellationToken);
}
