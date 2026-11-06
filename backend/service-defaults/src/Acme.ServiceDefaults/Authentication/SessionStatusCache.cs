using Microsoft.Extensions.Caching.Memory;

namespace Acme.ServiceDefaults.Authentication;

/// <summary>
/// Remembers a sign-in's status briefly, so a busy person's requests do not each ask identity-api. An open sign-in is
/// asked again after <see cref="OpenFor"/> (so ending one reaches every service within that); an ended one never opens
/// again, so it is remembered for as long as its access token could be shown.
/// </summary>
public sealed class SessionStatusCache
{
    public static readonly TimeSpan OpenFor = TimeSpan.FromSeconds(10);

    private readonly IMemoryCache _cache;
    private readonly TimeProvider _timeProvider;

    public SessionStatusCache(IMemoryCache cache, TimeProvider timeProvider)
    {
        _cache = cache;
        _timeProvider = timeProvider;
    }

    public async Task<bool> IsActiveAsync(AccessTokenSession session, Func<CancellationToken, Task<bool>> ask, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        ArgumentNullException.ThrowIfNull(ask);

        var key = $"session:{session.SessionId}";
        if (_cache.TryGetValue(key, out bool known))
        {
            return known;
        }

        var active = await ask(cancellationToken);
        var lifetime = active ? OpenFor : session.ExpiresAt - _timeProvider.GetUtcNow();
        if (lifetime > TimeSpan.Zero)
        {
            _cache.Set(key, active, lifetime);
        }

        return active;
    }
}
