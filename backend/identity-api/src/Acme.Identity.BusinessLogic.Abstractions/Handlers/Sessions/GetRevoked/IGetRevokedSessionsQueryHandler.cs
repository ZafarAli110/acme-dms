using Acme.Identity.DTO.Sessions;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Sessions.GetRevoked;

public interface IGetRevokedSessionsQueryHandler
{
    /// <summary>The sign-ins revoked since <paramref name="since"/> (never further back than the access token lifetime allows).</summary>
    Task<RevokedSessionsResponseDto> ExecuteAsync(DateTimeOffset? since, CancellationToken cancellationToken);
}
