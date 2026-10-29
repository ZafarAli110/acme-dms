using Acme.Identity.BusinessLogic.Abstractions.Handlers.WellKnown.GetJsonWebKeySet;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.DTO.WellKnown;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.WellKnown;

/// <summary>Standard discovery endpoints, so other services validate tokens without custom code.</summary>
[AllowAnonymous]
public sealed class WellKnownController : ApiControllerBase
{
    private readonly IGetJsonWebKeySetQueryHandler _getJsonWebKeySetQueryHandler;

    public WellKnownController(IGetJsonWebKeySetQueryHandler getJsonWebKeySetQueryHandler)
    {
        _getJsonWebKeySetQueryHandler = getJsonWebKeySetQueryHandler;
    }

    [HttpGet(".well-known/openid-configuration")]
    public ActionResult<OpenIdConfigurationDto> GetOpenIdConfiguration()
    {
        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        return new OpenIdConfigurationDto(TokenSettings.Issuer, $"{baseUrl}/.well-known/jwks.json", $"{baseUrl}/v1/tokens", ["RS256"]);
    }

    [HttpGet(".well-known/jwks.json")]
    public async Task<ActionResult<JsonWebKeySetDto>> GetJsonWebKeySetAsync(CancellationToken cancellationToken) =>
        await _getJsonWebKeySetQueryHandler.ExecuteAsync(cancellationToken);
}
