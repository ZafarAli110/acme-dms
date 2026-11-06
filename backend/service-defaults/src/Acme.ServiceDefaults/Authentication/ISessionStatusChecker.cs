namespace Acme.ServiceDefaults.Authentication;

/// <summary>An access token's sign-in: what a service needs to ask whether it is still open.</summary>
public sealed record AccessTokenSession(Guid SessionId, string AccessToken, DateTimeOffset ExpiresAt);

/// <summary>
/// Whether the sign-in an access token belongs to is still open. Signing out ends the sign-in at identity-api, and this
/// is how every service learns it: a token is not good for its whole 15 minutes once its sign-in was ended. identity-api
/// answers from its own database; the other services ask identity-api.
/// </summary>
public interface ISessionStatusChecker
{
    Task<bool> IsActiveAsync(AccessTokenSession session, CancellationToken cancellationToken);
}
