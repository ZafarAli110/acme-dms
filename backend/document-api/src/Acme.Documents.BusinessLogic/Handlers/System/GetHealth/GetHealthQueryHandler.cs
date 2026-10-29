using Acme.Documents.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Documents.DTO.System;
using Acme.Documents.Persistence.Database;

namespace Acme.Documents.BusinessLogic.Handlers.System.GetHealth;

internal sealed class GetHealthQueryHandler : IGetHealthQueryHandler
{
    private readonly DocumentsDbContext _dbContext;

    public GetHealthQueryHandler(DocumentsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken)
    {
        bool databaseReachable = await _dbContext.Database.CanConnectAsync(cancellationToken);
        return new HealthCheckResponseDto(databaseReachable ? "ok" : "degraded", databaseReachable);
    }
}
