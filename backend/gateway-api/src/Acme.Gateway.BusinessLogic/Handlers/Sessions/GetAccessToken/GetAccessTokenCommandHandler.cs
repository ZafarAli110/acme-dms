using Acme.Gateway.BusinessLogic.Abstractions.Clients;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.GetAccessToken;
using Acme.Gateway.BusinessLogic.Handlers.Sessions;
using Acme.Gateway.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Gateway.BusinessLogic.Handlers.Sessions.GetAccessToken;

/// <summary>
/// The access token to send on for a session, renewed first when it is about to expire.
///
/// One renewal at a time per session, on every gateway instance, with no transaction held across the call to identity-api
/// (<c>business-handlers.md</c>): a renewal first takes a lease (one short <c>UPDATE</c> that sets <c>renewing_until</c>, only
/// where no lease runs and the token is still due), calls identity-api, then saves the new tokens and gives the lease back in a
/// second short <c>UPDATE</c>. Each renewal replaces the refresh token, so two at once would look like a copy to identity-api.
/// A request that finds a lease running sends the token it has while that still works, and otherwise waits for the renewal.
/// The renewal runs on its own time limit, not the browser's: a tab closed midway must not leave the session holding a refresh
/// token identity-api has already replaced.
/// </summary>
internal sealed class GetAccessTokenCommandHandler : IGetAccessTokenCommandHandler
{
    /// <summary>How often a request waiting for another's renewal looks again.</summary>
    private static readonly TimeSpan _lookAgainAfter = TimeSpan.FromMilliseconds(200);

    private readonly GatewayDbContext _dbContext;
    private readonly IIdentityClient _identityClient;
    private readonly TimeProvider _timeProvider;

    public GetAccessTokenCommandHandler(GatewayDbContext dbContext, IIdentityClient identityClient, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _identityClient = identityClient;
        _timeProvider = timeProvider;
    }

    public async Task<string?> ExecuteAsync(string cookieValue, CallerContext caller, CancellationToken cancellationToken)
    {
        var id = SessionSecrets.IdOf(cookieValue);
        var waitUntil = _timeProvider.GetUtcNow().Add(SessionSettings.RenewalTimeout);
        while (true)
        {
            var now = _timeProvider.GetUtcNow();
            var session = await _dbContext.Sessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, cancellationToken);
            var tokens = session is null || session.ExpiresAt <= now ? null : SessionSecrets.Open(cookieValue, session.Tokens);
            if (session is null || tokens is null)
            {
                return null;
            }

            if (session.AccessTokenExpiresAt - now > SessionSettings.RenewEarly)
            {
                return tokens.AccessToken;
            }

            if (await TryTakeLeaseAsync(id, now, cancellationToken))
            {
                return await RenewAsync(cookieValue, id, tokens, session.AccessTokenExpiresAt, caller);
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
    /// One statement, so two requests cannot both win: Postgres checks the condition again on a row another request has just
    /// changed. Taken only while the token is still due, so a request that comes after a finished renewal does not renew again.
    /// </summary>
    private async Task<bool> TryTakeLeaseAsync(string id, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var due = now.Add(SessionSettings.RenewEarly);
        var leaseUntil = now.Add(SessionSettings.Lease);
        var taken = await _dbContext.Sessions
            .Where(s => s.Id == id && s.AccessTokenExpiresAt <= due && (s.RenewingUntil == null || s.RenewingUntil < now))
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.RenewingUntil, leaseUntil), cancellationToken);
        return taken == 1;
    }

    /// <summary>
    /// Holding the lease. Nothing here takes the browser's cancellation: once identity-api has answered, its answer is saved.
    /// </summary>
    private async Task<string?> RenewAsync(string cookieValue, string id, SessionTokens tokens, DateTimeOffset expiresAt, CallerContext caller)
    {
        using var timeout = new CancellationTokenSource(SessionSettings.RenewalTimeout, _timeProvider);
        IssuedTokens? renewed;
        try
        {
            renewed = await _identityClient.RefreshAsync(tokens.RefreshToken, caller, timeout.Token);
        }
        catch (Exception exception) when (exception is IdentityUnavailableException || (exception is OperationCanceledException && timeout.IsCancellationRequested))
        {
            await _dbContext.Sessions
                .Where(s => s.Id == id)
                .ExecuteUpdateAsync(set => set.SetProperty(s => s.RenewingUntil, (DateTimeOffset?)null), CancellationToken.None);
            // identity-api is not answering, but the token still works for a little while: send it, and renew next time.
            if (expiresAt > _timeProvider.GetUtcNow())
            {
                return tokens.AccessToken;
            }

            throw exception as IdentityUnavailableException ?? new IdentityUnavailableException("identity-api did not answer in time.", exception);
        }

        if (renewed is null)
        {
            // identity-api ended the sign-in (a copy of the refresh token was used, or it ran out): so does the gateway.
            await _dbContext.Sessions.Where(s => s.Id == id).ExecuteDeleteAsync(CancellationToken.None);
            return null;
        }

        var sealedTokens = SessionSecrets.Seal(cookieValue, new SessionTokens(renewed.AccessToken, renewed.RefreshToken));
        await _dbContext.Sessions
            .Where(s => s.Id == id)
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(s => s.Tokens, sealedTokens)
                    .SetProperty(s => s.AccessTokenExpiresAt, renewed.AccessTokenExpiresAt)
                    .SetProperty(s => s.RenewingUntil, (DateTimeOffset?)null),
                CancellationToken.None);
        return renewed.AccessToken;
    }
}
