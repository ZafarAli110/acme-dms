using System.Reflection;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Documents.DTO.System;
using Acme.Documents.Persistence.Database;

namespace Acme.Documents.BusinessLogic.Handlers.System.GetHealth;

internal sealed class GetHealthQueryHandler : IGetHealthQueryHandler
{
    /// <summary>
    /// The product version this build carries, "26.11.0": the SDK sets it from &lt;Version&gt; in Directory.Build.props
    /// and adds "+&lt;git commit&gt;", which is cut off here.
    /// </summary>
    private static readonly string Version =
        typeof(GetHealthQueryHandler).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
        ?? "unknown";

    private readonly DocumentsDbContext _dbContext;

    public GetHealthQueryHandler(DocumentsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken)
    {
        bool databaseReachable = await _dbContext.Database.CanConnectAsync(cancellationToken);
        return new HealthCheckResponseDto("document-api", databaseReachable ? "ok" : "degraded", Version, databaseReachable);
    }
}
