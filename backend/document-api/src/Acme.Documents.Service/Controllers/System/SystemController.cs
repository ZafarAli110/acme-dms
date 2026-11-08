using Acme.Documents.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Documents.DTO.System;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Documents.Service.Controllers.System;

public sealed class SystemController : ApiControllerBase
{
    private readonly IGetHealthQueryHandler _getHealthQueryHandler;

    public SystemController(IGetHealthQueryHandler getHealthQueryHandler)
    {
        _getHealthQueryHandler = getHealthQueryHandler;
    }

    [AllowAnonymous]
    [HttpGet("v1/system/health")]
    public async Task<ActionResult<HealthCheckResponseDto>> GetHealthAsync(CancellationToken cancellationToken)
    {
        // 503 when degraded, as identity-api does: the status code is what Aspire and a load balancer read.
        var health = await _getHealthQueryHandler.ExecuteAsync(cancellationToken);
        return health.Status == "ok" ? health : StatusCode(StatusCodes.Status503ServiceUnavailable, health);
    }
}
