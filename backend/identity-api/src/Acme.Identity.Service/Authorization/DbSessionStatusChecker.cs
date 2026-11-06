using Acme.Identity.BusinessLogic.Abstractions.Handlers.Sessions.IsActive;
using Acme.ServiceDefaults.Authentication;
using Microsoft.Extensions.Caching.Memory;

namespace Acme.Identity.Service.Authorization;

/// <summary>
/// identity-api answers for its own sign-ins from its database, not by asking itself. An open sign-in is remembered for a few
/// seconds (every request of a busy person would otherwise ask), an ended one until its access token could no longer be shown.
/// </summary>
internal sealed class DbSessionStatusChecker : ISessionStatusChecker
{
    private static readonly TimeSpan _openFor = TimeSpan.FromSeconds(5);

    private readonly ISessionActiveQuery _sessionActiveQuery;
    private readonly IMemoryCache _cache;
    private readonly TimeProvider _timeProvider;

    public DbSessionStatusChecker(ISessionActiveQuery sessionActiveQuery, IMemoryCache cache, TimeProvider timeProvider)
    {
        _sessionActiveQuery = sessionActiveQuery;
        _cache = cache;
        _timeProvider = timeProvider;
    }

    public async Task<bool> IsActiveAsync(AccessTokenSession session, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        var key = $"session:{session.SessionId}";
        if (_cache.TryGetValue(key, out bool known))
        {
            return known;
        }

        var active = await _sessionActiveQuery.ExecuteAsync(session.SessionId, cancellationToken);
        var lifetime = active ? _openFor : session.ExpiresAt - _timeProvider.GetUtcNow();
        if (lifetime > TimeSpan.Zero)
        {
            _cache.Set(key, active, lifetime);
        }

        return active;
    }
}
