using Acme.Identity.DTO.Tokens;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;

public interface ICreateTokenCommandHandler
{
    Task<TokenCreateResponseDto> ExecuteAsync(TokenCreateRequestDto request, CancellationToken cancellationToken);
}
