using Acme.Documents.DTO.System;

namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.System.GetHealth;

public interface IGetHealthQueryHandler
{
    Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken);
}
