using Acme.Identity.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Identity.DTO.System;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.System;

public sealed class SystemController : ApiControllerBase
{
    private readonly IGetHealthQueryHandler _getHealthQueryHandler;

    public SystemController(IGetHealthQueryHandler getHealthQueryHandler)
    {
        _getHealthQueryHandler = getHealthQueryHandler;
    }

    /// <summary>
    /// 200 when the service is fine; 503, with the same body, when it is degraded (no database, or no key it can sign
    /// with), so Aspire and a load balancer stop sending it sign-ins it would fail.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("v1/system/health")]
    public async Task<ActionResult<HealthCheckResponseDto>> GetHealthAsync(CancellationToken cancellationToken)
    {
        var health = await _getHealthQueryHandler.ExecuteAsync(cancellationToken);
        return health.Status == "ok" ? health : StatusCode(StatusCodes.Status503ServiceUnavailable, health);
    }
}
