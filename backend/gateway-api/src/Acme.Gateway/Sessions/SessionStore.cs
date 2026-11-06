using Microsoft.EntityFrameworkCore;

namespace Acme.Gateway.Sessions;

/// <summary>
/// The browsers' sign-ins (<see cref="Session"/>): made at sign-in, read on every request to find the access token to send on,
/// renewed shortly before that token expires, and deleted at sign-out, which ends the sign-in at once.
/// </summary>
internal sealed class SessionStore
{
    /// <summary>Must match identity-api's <c>TokenSettings.RefreshLifetimeSeconds</c>: a sign-in lasts at most this long.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);

    /// <summary>A request this close to the access token's expiry gets a new one first, so the service never sees it expire.</summary>
    public static readonly TimeSpan RenewEarly = TimeSpan.FromSeconds(60);

    /// <summary>
    /// A renewal's own time limit, waiting for the lock included. Not the browser's: once identity-api replaces the refresh
    /// token, the new one must be saved even if the browser has gone, or the session would keep only the replaced one.
    /// </summary>
    public static readonly TimeSpan RenewalTimeout = TimeSpan.FromSeconds(15);

    private readonly GatewayDbContext _dbContext;
    private readonly IdentityClient _identityClient;
    private readonly TimeProvider _timeProvider;

    public SessionStore(GatewayDbContext dbContext, IdentityClient identityClient, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _identityClient = identityClient;
        _timeProvider = timeProvider;
    }

    /// <summary>A new session for what identity-api issued. Returns the cookie's value, which is stored nowhere.</summary>
    public async Task<string> CreateAsync(IssuedTokens issued, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(issued);
        var now = _timeProvider.GetUtcNow();
        // Sessions that ran out are cleared as people sign in: the table stays as small as the people at work.
        await _dbContext.Sessions.Where(s => s.ExpiresAt <= now).ExecuteDeleteAsync(cancellationToken);

        var value = SessionCookie.NewValue();
        _dbContext.Sessions.Add(new Session
        {
            Id = SessionCookie.IdOf(value),
            UserId = issued.UserId,
            Tokens = SessionCookie.Seal(value, new SessionTokens(issued.AccessToken, issued.RefreshToken)),
            AccessTokenExpiresAt = issued.AccessTokenExpiresAt,
            CreatedAt = now,
            ExpiresAt = now.Add(Lifetime),
        });
        await _dbContext.SaveChangesAsync(cancellationToken);
        return value;
    }

    /// <summary>
    /// The access token to send on for this cookie, renewed first when it is about to expire. Null when there is no such
    /// sign-in (signed out, ran out, or ended at identity-api). Throws when the token has expired and identity-api cannot be
    /// reached to renew it; a token that is only close to expiry is still sent.
    /// </summary>
    public async Task<string?> GetAccessTokenAsync(string value, HttpContext browser, CancellationToken cancellationToken)
    {
        var id = SessionCookie.IdOf(value);
        var now = _timeProvider.GetUtcNow();
        var session = await _dbContext.Sessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, cancellationToken);
        var tokens = session is null || session.ExpiresAt <= now ? null : SessionCookie.Open(value, session.Tokens);
        if (session is null || tokens is null)
        {
            return null;
        }

        if (session.AccessTokenExpiresAt - now > RenewEarly)
        {
            return tokens.AccessToken;
        }

        return await RenewAsync(value, id, browser);
    }

    /// <summary>
    /// Deletes the session: from now on its cookie signs no one in, on every gateway instance. Returns the refresh token, for
    /// the caller to end the sign-in at identity-api too; null when there was no such session.
    /// </summary>
    public async Task<string?> EndAsync(string value, CancellationToken cancellationToken)
    {
        var id = SessionCookie.IdOf(value);
        var session = await _dbContext.Sessions.SingleOrDefaultAsync(s => s.Id == id, cancellationToken);
        if (session is null)
        {
            return null;
        }

        _dbContext.Sessions.Remove(session);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return SessionCookie.Open(value, session.Tokens)?.RefreshToken;
    }

    /// <summary>
    /// One renewal at a time per session, on every gateway instance: the row is locked, then read again, and a request that
    /// waited finds the token the first one got. Each renewal replaces the refresh token, so two at once would look like a copy
    /// to identity-api. It runs to the end on its own time limit (<see cref="RenewalTimeout"/>), not the browser's: a tab closed
    /// mid-renewal must not leave the session holding a refresh token identity-api has already replaced.
    /// </summary>
    private async Task<string?> RenewAsync(string value, string id, HttpContext browser)
    {
        using var timeout = new CancellationTokenSource(RenewalTimeout);
        var cancellationToken = timeout.Token;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var session = await _dbContext.Sessions
            .FromSqlInterpolated($"SELECT * FROM sessions WHERE id = {id} FOR UPDATE")
            .SingleOrDefaultAsync(cancellationToken);
        var tokens = session is null ? null : SessionCookie.Open(value, session.Tokens);
        if (session is null || tokens is null)
        {
            return null;
        }

        var now = _timeProvider.GetUtcNow();
        if (session.AccessTokenExpiresAt - now > RenewEarly)
        {
            return tokens.AccessToken;
        }

        IssuedTokens? renewed;
        try
        {
            renewed = await _identityClient.RefreshAsync(tokens.RefreshToken, browser, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException && session.AccessTokenExpiresAt > now)
        {
            // identity-api is not answering, but the token still works for a little while: send it, and renew next time.
            return tokens.AccessToken;
        }

        if (renewed is null)
        {
            // identity-api ended the sign-in (a copy of the refresh token was used, or it ran out): so does the gateway.
            _dbContext.Sessions.Remove(session);
            await _dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        session.Tokens = SessionCookie.Seal(value, new SessionTokens(renewed.AccessToken, renewed.RefreshToken));
        session.AccessTokenExpiresAt = renewed.AccessTokenExpiresAt;
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return renewed.AccessToken;
    }
}
