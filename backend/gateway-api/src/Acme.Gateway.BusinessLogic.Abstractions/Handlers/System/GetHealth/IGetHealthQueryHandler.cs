using Acme.Gateway.DTO.System;

namespace Acme.Gateway.BusinessLogic.Abstractions.Handlers.System.GetHealth;

public interface IGetHealthQueryHandler
{
    Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken);
}
