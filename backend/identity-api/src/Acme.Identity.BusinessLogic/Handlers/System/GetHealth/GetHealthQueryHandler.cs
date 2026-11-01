using System.Reflection;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Identity.DTO.System;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Handlers.System.GetHealth;

internal sealed class GetHealthQueryHandler : IGetHealthQueryHandler
{
    /// <summary>
    /// The product version this build carries, "26.11.0": the SDK sets it from &lt;Version&gt; in Directory.Build.props
    /// and adds "+&lt;git commit&gt;", which is cut off here.
    /// </summary>
    private static readonly string Version =
        typeof(GetHealthQueryHandler).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
        ?? "unknown";

    private readonly IdentityDbContext _dbContext;

    public GetHealthQueryHandler(IdentityDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken)
    {
        var databaseReachable = await _dbContext.Database.CanConnectAsync(cancellationToken);
        return new HealthCheckResponseDto("identity-api", databaseReachable ? "ok" : "degraded", Version, databaseReachable);
    }
}
