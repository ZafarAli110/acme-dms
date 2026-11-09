using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.GetAccessToken;
using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.Persistence.Database;
using Acme.Gateway.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Acme.Gateway.BusinessLogic.Handlers.Sessions.GetAccessToken;

/// <summary>
/// The access token to send on for a session, renewed first when it is about to expire.
///
/// One renewal at a time per session, on every gateway instance, with no transaction held across the call to identity-api
/// (<c>business-handlers.md</c>): a renewal takes a lease (one short <c>UPDATE</c> that sets <c>renewing_until</c>, only where
/// no lease runs and the token is still due, all by Postgres's clock so the instances' clocks do not matter), calls
/// identity-api, then saves the new tokens and gives the lease back in a second short <c>UPDATE</c>, which applies only while
/// the lease is still its own. A request that finds a lease running sends the token it has while that still works, and
/// otherwise waits for the renewal.
///
/// A renewal runs on its own time limit, not the browser's, and gives its lease back on any failure: the next request then
/// asks identity-api again inside its grace period and gets the same replacement token, so an answer that was lost costs
/// nothing.
/// </summary>
internal sealed partial class GetAccessTokenCommandHandler : IGetAccessTokenCommandHandler
{
    /// <summary>How often a request waiting for another's renewal looks again.</summary>
    private static readonly TimeSpan _lookAgainAfter = TimeSpan.FromMilliseconds(200);

    /// <summary>
    /// The session, read on every request through the gateway: compiled once, so EF Core does not turn the LINQ into SQL
    /// each time (ACME-129: with building the context, about a third of the gateway's work at 800 requests a second).
    /// </summary>
    private static readonly Func<GatewayDbContext, string, CancellationToken, Task<Session?>> _findSession =
        EF.CompileAsyncQuery((GatewayDbContext dbContext, string id, CancellationToken cancellationToken) =>
            dbContext.Sessions.AsNoTracking().SingleOrDefault(s => s.Id == id));

    private readonly GatewayDbContext _dbContext;
    private readonly IIdentityClient _identityClient;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<GetAccessTokenCommandHandler> _logger;

    public GetAccessTokenCommandHandler(
        GatewayDbContext dbContext,
        IIdentityClient identityClient,
        TimeProvider timeProvider,
        ILogger<GetAccessTokenCommandHandler> logger)
    {
        _dbContext = dbContext;
        _identityClient = identityClient;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<string?> ExecuteAsync(string cookieValue, CallerContext caller, CancellationToken cancellationToken)
    {
        var id = SessionSecrets.IdOf(cookieValue);
        var waitUntil = _timeProvider.GetUtcNow().Add(SessionSettings.Lease);
        while (true)
        {
            var now = _timeProvider.GetUtcNow();
            var session = await _findSession(_dbContext, id, cancellationToken);
            var tokens = session is null || session.ExpiresAt <= now ? null : SessionSecrets.Open(cookieValue, session.Tokens);
            if (session is null || tokens is null)
            {
                return null;
            }

            if (session.AccessTokenExpiresAt - now > SessionSettings.RenewEarly)
            {
                return tokens.AccessToken;
            }

            // Not the browser's cancellation: a lease committed by Postgres whose answer was then abandoned would stay held for
            // its 15 s with no renewal behind it, and the requests waiting on it would get 503 (the state sweep's F6). Once
            // taken, the renewal ignores the browser too (RenewAsync).
            if (await TryTakeLeaseAsync(id, CancellationToken.None) is { } lease)
            {
                return await RenewAsync(cookieValue, id, tokens, session.AccessTokenExpiresAt, lease.Until, lease.Key, caller);
            }

            // Another request is renewing it. The token this one has still works: send it.
            if (session.AccessTokenExpiresAt > now)
            {
                return tokens.AccessToken;
            }

            if (now >= waitUntil)
            {
                throw new IdentityUnavailableException("A renewal of this sign-in did not finish in time.");
            }

            await Task.Delay(_lookAgainAfter, _timeProvider, cancellationToken);
        }
    }

    /// <summary>
    /// The lease, or null when another request holds it or the token is no longer due. One statement, so two requests cannot
    /// both win: Postgres checks the condition again on a row another request has just changed. The lease's end it returns
    /// is the renewal's own mark: the save and the release apply only while the row still carries it.
    /// </summary>
    private async Task<Lease?> TryTakeLeaseAsync(string id, CancellationToken cancellationToken)
    {
        // A key made with the first lease of a renewal, and kept by every retry until one succeeds (`renewal_key`).
        var newKey = Guid.NewGuid().ToString("N");
        var leases = await _dbContext.Database
            .SqlQuery<Lease>($"""
                UPDATE sessions SET renewing_until = now() + {SessionSettings.Lease}, renewal_key = coalesce(renewal_key, {newKey})
                WHERE id = {id}
                  AND access_token_expires_at <= now() + {SessionSettings.RenewEarly}
                  AND (renewing_until IS NULL OR renewing_until < now())
                RETURNING renewing_until AS "Until", renewal_key AS "Key"
                """)
            .ToListAsync(cancellationToken);
        return leases.Count == 1 ? leases[0] : null;
    }

    /// <summary>A renewal's lease: its end, which marks the renewal's own writes, and the renewal's key.</summary>
    private sealed record Lease(DateTimeOffset Until, string Key);

    /// <summary>Holding the lease. Nothing here takes the browser's cancellation: once identity-api has answered, its answer is saved.</summary>
    private async Task<string?> RenewAsync(
        string cookieValue,
        string id,
        SessionTokens tokens,
        DateTimeOffset expiresAt,
        DateTimeOffset lease,
        string renewalKey,
        CallerContext caller)
    {
        IssuedTokens? renewed;
        try
        {
            renewed = await RefreshWithOneRetryAsync(tokens.RefreshToken, renewalKey, caller);
        }
        catch (Exception exception)
        {
            // Whatever went wrong, the next request may try at once.
            await GiveBackLeaseAsync(id, lease);
            if (exception is not IdentityUnavailableException)
            {
                throw;
            }

            // identity-api is not answering, but the token still works for a little while: send it, and renew next time.
            if (expiresAt > _timeProvider.GetUtcNow())
            {
                return tokens.AccessToken;
            }

            throw;
        }

        if (renewed is null)
        {
            // identity-api ended the sign-in (a copy of the refresh token was used, or it ran out): so does the gateway.
            await _dbContext.Sessions.Where(s => s.Id == id).ExecuteDeleteAsync(CancellationToken.None);
            return null;
        }

        var sealedTokens = SessionSecrets.Seal(cookieValue, new SessionTokens(renewed.AccessToken, renewed.RefreshToken));
        var saved = await _dbContext.Sessions
            .Where(s => s.Id == id && s.RenewingUntil == lease)
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(s => s.Tokens, sealedTokens)
                    .SetProperty(s => s.AccessTokenExpiresAt, renewed.AccessTokenExpiresAt)
                    .SetProperty(s => s.RenewingUntil, (DateTimeOffset?)null)
                    // Renewed: the next renewal is a new one, with a key of its own.
                    .SetProperty(s => s.RenewalKey, (string?)null),
                CancellationToken.None);
        if (saved == 0)
        {
            // The lease ran out before this renewal finished, and another one has renewed since. identity-api gave both the
            // same replacement inside its grace period, so the session holds a working token either way.
            LogLeaseOvertaken(_logger);
        }

        return renewed.AccessToken;
    }

    /// <summary>
    /// Asks identity-api, and once more at once when no answer came. It may have replaced the token and lost the answer: asked
    /// again inside its 20-second grace period, it gives the same replacement. Left to the next request, which may come
    /// after the grace, the old token would look like a stolen copy and the sign-in would end.
    /// </summary>
    private async Task<IssuedTokens?> RefreshWithOneRetryAsync(string refreshToken, string renewalKey, CallerContext caller)
    {
        try
        {
            return await RefreshOnceAsync(refreshToken, renewalKey, caller, SessionSettings.RenewalTimeout);
        }
        catch (IdentityUnavailableException)
        {
            try
            {
                return await RefreshOnceAsync(refreshToken, renewalKey, caller, SessionSettings.RenewalRetryTimeout);
            }
            catch (IdentityUnavailableException)
            {
                // If identity-api replaced the token and both answers were lost, the next request more than 20 seconds
                // from now looks like a stolen copy and ends the sign-in: this line is where to start looking.
                LogRenewalUnanswered(_logger);
                throw;
            }
        }
    }

    private async Task<IssuedTokens?> RefreshOnceAsync(string refreshToken, string renewalKey, CallerContext caller, TimeSpan wait)
    {
        using var timeout = new CancellationTokenSource(wait, _timeProvider);
        try
        {
            return await _identityClient.RefreshAsync(refreshToken, renewalKey, caller, timeout.Token);
        }
        catch (OperationCanceledException exception) when (timeout.IsCancellationRequested)
        {
            throw new IdentityUnavailableException("identity-api did not answer in time.", exception);
        }
    }

    private async Task GiveBackLeaseAsync(string id, DateTimeOffset lease) =>
        await _dbContext.Sessions
            .Where(s => s.Id == id && s.RenewingUntil == lease)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.RenewingUntil, (DateTimeOffset?)null), CancellationToken.None);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A session's renewal got no answer twice; if identity-api replaced the token, a later renewal may end the sign-in")]
    private static partial void LogRenewalUnanswered(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A session's renewal outlasted its lease; another renewal saved first")]
    private static partial void LogLeaseOvertaken(ILogger logger);
}
