namespace Acme.Gateway.BusinessLogic.Abstractions.Clients;

/// <summary>
/// identity-api's token endpoints, as the gateway calls them for a browser: the same endpoints a script uses. Throws
/// <see cref="IdentityUnavailableException"/> when identity-api cannot be reached or does not answer in time.
/// </summary>
public interface IIdentityClient
{
    /// <summary>Checks the password: the tokens it issues, or its refusal (401, 429, 400) to pass to the browser as it is.</summary>
    Task<IdentitySignInResult> SignInAsync(string email, string password, CallerContext caller, CancellationToken cancellationToken);

    /// <summary>
    /// A new access token for this refresh token; null when identity-api refused it (the sign-in ended there, or ran out). Inside
    /// identity-api's grace period a replay gets an access token and no new refresh token: the one given is kept.
    /// </summary>
    Task<IssuedTokens?> RefreshAsync(string refreshToken, CallerContext caller, CancellationToken cancellationToken);

    /// <summary>Ends the sign-in at identity-api: the whole refresh-token chain.</summary>
    Task RevokeAsync(string refreshToken, CallerContext caller, CancellationToken cancellationToken);
}

/// <summary>What identity-api issued at a sign-in or a refresh.</summary>
public sealed record IssuedTokens(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAt, Guid UserId);

/// <summary>identity-api's answer to a refused sign-in, to pass on unchanged.</summary>
public sealed record IdentityRefusal(int Status, string? ContentType, string? RetryAfter, byte[] Body);

/// <summary>A sign-in identity-api accepted (<see cref="Tokens"/>) or refused (<see cref="Refusal"/>).</summary>
public sealed record IdentitySignInResult(IssuedTokens? Tokens, IdentityRefusal? Refusal);
