namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Revoke;

public interface IRevokeTokenCommandHandler
{
    Task ExecuteAsync(string? refreshToken, CancellationToken cancellationToken);
}
