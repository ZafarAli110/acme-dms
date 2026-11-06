using Acme.Identity.DTO.Tokens;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Revoke;

public interface IRevokeTokenCommandHandler
{
    Task ExecuteAsync(TokenRevokeRequestDto request, CancellationToken cancellationToken);
}
