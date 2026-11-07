namespace Acme.Gateway.BusinessLogic.Abstractions.RestClients;

/// <summary>
/// identity-api's token endpoints, as the gateway calls them for a browser: the same endpoints a script uses. Throws
/// <see cref="IdentityUnavailableException"/> when identity-api cannot be reached, does not answer in time, or answers with
/// anything other than a token or a refusal meant for the person.
/// </summary>
public interface IIdentityClient
{
    /// <summary>Checks the password: the tokens it issues, or its refusal (400, 401, 429) to pass to the browser as it is.</summary>
    Task<IdentitySignInResult> SignInAsync(string email, string password, CallerContext caller, CancellationToken cancellationToken);

    /// <summary>
    /// A new access token for this refresh token, and the refresh token that replaces it; null when identity-api refused it
    /// (the sign-in ended there, or ran out). Asked again with the same refresh token inside identity-api's grace period (an
    /// answer that was lost), it gives the same replacement; when it gives none, the one given is kept.
    /// </summary>
    Task<IssuedTokens?> RefreshAsync(string refreshToken, CallerContext caller, CancellationToken cancellationToken);

    /// <summary>As above, with the renewal's key (Idempotency-Key): the same key until a renewal of the sign-in succeeds.</summary>
    Task<IssuedTokens?> RefreshAsync(string refreshToken, string? renewalKey, CallerContext caller, CancellationToken cancellationToken);

    /// <summary>Ends the sign-in at identity-api: the whole refresh-token chain.</summary>
    Task RevokeAsync(string refreshToken, CallerContext caller, CancellationToken cancellationToken);
}
