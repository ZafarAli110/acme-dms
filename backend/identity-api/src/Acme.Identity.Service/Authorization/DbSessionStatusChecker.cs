using Acme.Identity.BusinessLogic.Abstractions.Handlers.Sessions.IsActive;
using Acme.ServiceDefaults.Authentication;

namespace Acme.Identity.Service.Authorization;

/// <summary>identity-api answers for its own sign-ins from its database (briefly remembered), not by asking itself.</summary>
internal sealed class DbSessionStatusChecker : ISessionStatusChecker
{
    private readonly ISessionActiveQuery _sessionActiveQuery;
    private readonly SessionStatusCache _cache;

    public DbSessionStatusChecker(ISessionActiveQuery sessionActiveQuery, SessionStatusCache cache)
    {
        _sessionActiveQuery = sessionActiveQuery;
        _cache = cache;
    }

    public Task<bool> IsActiveAsync(AccessTokenSession session, CancellationToken cancellationToken) =>
        _cache.IsActiveAsync(session, ct => _sessionActiveQuery.ExecuteAsync(session.SessionId, ct), cancellationToken);
}
