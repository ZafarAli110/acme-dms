using Acme.Gateway.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Gateway.DTO.System;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Gateway.Service.Controllers.System;

[ApiController]
public sealed class SystemController : ControllerBase
{
    private readonly IGetHealthQueryHandler _getHealthQueryHandler;

    public SystemController(IGetHealthQueryHandler getHealthQueryHandler)
    {
        _getHealthQueryHandler = getHealthQueryHandler;
    }

    [HttpGet("v1/system/health")]
    public async Task<ActionResult<HealthCheckResponseDto>> GetHealthAsync(CancellationToken cancellationToken) =>
        await _getHealthQueryHandler.ExecuteAsync(cancellationToken);
}
