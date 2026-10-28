using Acme.Identity.DTO.System;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.System.GetHealth;

public interface IGetHealthQueryHandler
{
    Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken);
}
