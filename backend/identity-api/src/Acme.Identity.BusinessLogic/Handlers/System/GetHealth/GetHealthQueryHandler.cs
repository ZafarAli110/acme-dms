using System.Reflection;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.DTO.System;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Handlers.System.GetHealth;

internal sealed class GetHealthQueryHandler : IGetHealthQueryHandler
{
    /// <summary>
    /// The product version this build carries, "26.11.0": the SDK sets it from &lt;Version&gt; in Directory.Build.props
    /// and adds "+&lt;git commit&gt;", which is cut off here.
    /// </summary>
    private static readonly string _version =
        typeof(GetHealthQueryHandler).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
        ?? "unknown";

    private readonly IdentityDbContext _dbContext;
    private readonly ISigningKeyProvider _signingKeyProvider;

    public GetHealthQueryHandler(IdentityDbContext dbContext, ISigningKeyProvider signingKeyProvider)
    {
        _dbContext = dbContext;
        _signingKeyProvider = signingKeyProvider;
    }

    public async Task<HealthCheckResponseDto> ExecuteAsync(CancellationToken cancellationToken)
    {
        var databaseReachable = await _dbContext.Database.CanConnectAsync(cancellationToken);
        // An instance whose Data Protection keys cannot open the signing key in use signs no one in: not fine either.
        var canSign = databaseReachable && await _signingKeyProvider.CanSignAsync(cancellationToken);
        return new HealthCheckResponseDto("identity-api", canSign ? "ok" : "degraded", _version, databaseReachable);
    }
}
