namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Refresh;

public interface IRefreshTokenCommandHandler
{
    /// <summary>The refresh token comes from the cookie. Returns a new access token and the refresh token that replaces it.</summary>
    Task<IssuedTokens> ExecuteAsync(string? refreshToken, CancellationToken cancellationToken);

    /// <summary>
    /// As above, with the caller's renewal key (<c>Idempotency-Key</c>): the gateway sends the same key until a renewal of
    /// that sign-in succeeds. The same old token with the same key gets the same unused replacement however late it comes
    /// (its answer was lost), where without the key, after the grace period, it would be taken for a stolen copy.
    /// </summary>
    Task<IssuedTokens> ExecuteAsync(string? refreshToken, string? renewalKey, CancellationToken cancellationToken);
}
