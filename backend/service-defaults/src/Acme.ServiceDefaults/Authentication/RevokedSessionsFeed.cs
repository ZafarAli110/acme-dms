using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;

namespace Acme.ServiceDefaults.Authentication;

/// <summary>
/// Keeps the sign-ins identity-api has ended lately, and refuses their access tokens. Every few seconds it asks identity-api
/// (<c>GET v1/sessions/revoked?since=</c>) and remembers what comes back for as long as an access token can live. A request
/// then only looks the sign-in up in memory: nothing waits for identity-api, a slow or absent identity-api cannot make a
/// request slow or refuse it (new sign-ins can only end at identity-api, so while it is down there is nothing new to learn),
/// and the cost is one small question per instance, not per person.
///
/// Every question starts at the last answer's clock, or at the oldest a live token could be, whichever is later: after a
/// long outage the first answer is complete for any token that can still be shown.
/// </summary>
public sealed class RevokedSessionsFeed : BackgroundService, ISessionStatusChecker
{
    /// <summary>How often identity-api is asked. A sign-out reaches this service within this, and the next question's own time.</summary>
    public static readonly TimeSpan AskEvery = TimeSpan.FromSeconds(5);

    /// <summary>An access token lives 15 minutes; one more for clock drift. Must match identity-api's <c>TokenSettings</c>.</summary>
    public static readonly TimeSpan RememberFor = TimeSpan.FromMinutes(16);

    /// <summary>A little back from the last answer's clock, so a sign-in ended at the very moment of the last answer is not missed.</summary>
    private static readonly TimeSpan Overlap = TimeSpan.FromSeconds(2);

    private readonly HttpClient _httpClient;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<RevokedSessionsFeed> _logger;
    private readonly string? _identityApiUrl;
    private readonly ConcurrentDictionary<Guid, DateTimeOffset> _revoked = new();
    private DateTimeOffset? _lastAnswerNow;

    public RevokedSessionsFeed(HttpClient httpClient, TimeProvider timeProvider, IConfiguration configuration, ILogger<RevokedSessionsFeed> logger)
    {
        _httpClient = httpClient;
        _timeProvider = timeProvider;
        _logger = logger;
        _identityApiUrl = configuration["services:identity-api:http:0"];
    }

    public bool IsRevoked(Guid sessionId) => _revoked.ContainsKey(sessionId);

    public Task<bool> IsActiveAsync(AccessTokenSession session, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        return Task.FromResult(!IsRevoked(session.SessionId));
    }

    /// <summary>Asks once, before the service takes requests, so a sign-in ended while it was down is known from the first one.</summary>
    public override async Task StartAsync(CancellationToken cancellationToken)
    {
        await RefreshAsync(cancellationToken);
        await base.StartAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(AskEvery, _timeProvider);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await RefreshAsync(stoppingToken);
        }
    }

    /// <summary>One question and what follows from the answer; a failure keeps what is known (and is asked again at the next tick).</summary>
    public async Task RefreshAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_identityApiUrl))
        {
            return;
        }

        var now = _timeProvider.GetUtcNow();
        var since = _lastAnswerNow is { } last ? last - Overlap : now - RememberFor;
        try
        {
            var query = Uri.EscapeDataString(since.ToString("O", CultureInfo.InvariantCulture));
            using var response = await _httpClient.GetAsync($"{_identityApiUrl}/v1/sessions/revoked?since={query}", cancellationToken);
            response.EnsureSuccessStatusCode();
            var answer = await response.Content.ReadFromJsonAsync<Answer>(cancellationToken) ?? throw new InvalidOperationException("Empty answer.");
            foreach (var sessionId in answer.Revoked)
            {
                _revoked[sessionId] = now + RememberFor;
            }

            _lastAnswerNow = answer.Now;
            foreach (var (sessionId, until) in _revoked)
            {
                if (until <= now)
                {
                    _revoked.TryRemove(sessionId, out _);
                }
            }
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or InvalidOperationException or System.Text.Json.JsonException)
        {
            _logger.LogWarning(exception, "identity-api could not be asked which sign-ins ended; what is known is kept, and it is asked again.");
        }
    }

    private sealed record Answer(DateTimeOffset Now, List<Guid> Revoked);
}
