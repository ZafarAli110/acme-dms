using Acme.Gateway.BusinessLogic.Abstractions.RestClients;

namespace Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.GetAccessToken;

/// <summary>
/// The access token to send on for a session, renewed first when it is about to expire (a write, so a command). Null when there
/// is no such sign-in (signed out, ran out, or ended at identity-api). Throws <see cref="IdentityUnavailableException"/> when the
/// token has expired and identity-api cannot renew it; a token that is only close to expiry is still given.
/// </summary>
public interface IGetAccessTokenCommandHandler
{
    Task<string?> ExecuteAsync(string cookieValue, CallerContext caller, CancellationToken cancellationToken);
}
