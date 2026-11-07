using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.DTO.Sessions;

namespace Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Create;

/// <summary>Signing a browser in: the password checked at identity-api, its tokens kept in a new session.</summary>
public interface ICreateSessionCommandHandler
{
    /// <summary>
    /// The new session's cookie value, or identity-api's refusal. <paramref name="replacedCookie"/> is the session the browser
    /// had: it ends, so a copy of its cookie signs no one in afterwards.
    /// </summary>
    Task<CreateSessionResult> ExecuteAsync(
        SessionCreateRequestDto request,
        string? replacedCookie,
        CallerContext caller,
        CancellationToken cancellationToken);
}
