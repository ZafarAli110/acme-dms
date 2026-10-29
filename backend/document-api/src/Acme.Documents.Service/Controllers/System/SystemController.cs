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
    public async Task<ActionResult<HealthCheckResponseDto>> GetHealthAsync(CancellationToken cancellationToken) =>
        await _getHealthQueryHandler.ExecuteAsync(cancellationToken);
}
