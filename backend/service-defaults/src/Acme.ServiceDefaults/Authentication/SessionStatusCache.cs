using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Memory;

namespace Acme.ServiceDefaults.Authentication;

/// <summary>
/// Remembers a sign-in's status briefly, so a busy person's requests do not each ask identity-api. An open sign-in is
/// asked again after <see cref="OpenFor"/> (so ending one reaches every service within that); an ended one never opens
/// again, so it is remembered for as long as its access token could be shown. Requests that find nothing remembered at
/// the same moment (a page load sends several) share one question.
/// </summary>
public sealed class SessionStatusCache
{
    public static readonly TimeSpan OpenFor = TimeSpan.FromSeconds(10);

    private readonly IMemoryCache _cache;
    private readonly TimeProvider _timeProvider;
    private readonly ConcurrentDictionary<Guid, Lazy<Task<bool>>> _asking = new();

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

        // The question is not tied to the first request's cancellation: the others are waiting on it too. It has its own
        // limit (the HTTP client's timeout, the database's).
        var asking = _asking.GetOrAdd(session.SessionId, _ => new Lazy<Task<bool>>(() => AskAndRememberAsync(session, key, ask)));
        try
        {
            return await asking.Value.WaitAsync(cancellationToken);
        }
        finally
        {
            _asking.TryRemove(new KeyValuePair<Guid, Lazy<Task<bool>>>(session.SessionId, asking));
        }
    }

    private async Task<bool> AskAndRememberAsync(AccessTokenSession session, string key, Func<CancellationToken, Task<bool>> ask)
    {
        var active = await ask(CancellationToken.None);
        var lifetime = active ? OpenFor : session.ExpiresAt - _timeProvider.GetUtcNow();
        if (lifetime > TimeSpan.Zero)
        {
            _cache.Set(key, active, lifetime);
        }

        return active;
    }
}
