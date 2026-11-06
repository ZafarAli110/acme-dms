using Acme.Identity.DTO.Tokens;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;

public interface ICreateTokenCommandHandler
{
    Task<IssuedTokens> ExecuteAsync(TokenCreateRequestDto request, CancellationToken cancellationToken);
}
