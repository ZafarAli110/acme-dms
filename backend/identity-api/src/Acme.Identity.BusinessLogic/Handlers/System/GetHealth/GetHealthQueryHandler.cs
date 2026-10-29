using Acme.Identity.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Identity.DTO.System;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Handlers.System.GetHealth;

internal sealed class GetHealthQueryHandler : IGetHealthQueryHandler
{
    private readonly IdentityDbContext _dbContext;

    public GetHealthQueryHandler(IdentityDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken)
    {
        var databaseReachable = await _dbContext.Database.CanConnectAsync(cancellationToken);
        return new HealthCheckResponseDto(databaseReachable ? "ok" : "degraded", databaseReachable);
    }
}
