using System.Reflection;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Gateway.DTO.System;
using Acme.Gateway.Persistence.Database;

namespace Acme.Gateway.BusinessLogic.Handlers.System.GetHealth;

internal sealed class GetHealthQueryHandler : IGetHealthQueryHandler
{
    /// <summary>
    /// The product version this build carries, "26.11.0": the SDK sets it from &lt;Version&gt; in Directory.Build.props
    /// and adds "+&lt;git commit&gt;", which is cut off here.
    /// </summary>
    private static readonly string _version =
        typeof(GetHealthQueryHandler).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
        ?? "unknown";

    private readonly GatewayDbContext _dbContext;

    public GetHealthQueryHandler(GatewayDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken)
    {
        var databaseReachable = await _dbContext.Database.CanConnectAsync(cancellationToken);
        return new HealthCheckResponseDto("gateway-api", databaseReachable ? "ok" : "degraded", _version, databaseReachable);
    }
}
