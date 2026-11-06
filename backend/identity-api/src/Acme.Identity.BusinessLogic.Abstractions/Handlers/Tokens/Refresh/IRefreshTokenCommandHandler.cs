using Acme.Identity.DTO.Tokens;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Refresh;

public interface IRefreshTokenCommandHandler
{
    Task<TokenRefreshResponseDto> ExecuteAsync(TokenRefreshRequestDto request, CancellationToken cancellationToken);
}
