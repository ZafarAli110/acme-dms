namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Refresh;

public interface IRefreshTokenCommandHandler
{
    /// <summary>The refresh token comes from the cookie. Returns a new access token and the refresh token that replaces it.</summary>
    Task<IssuedTokens> ExecuteAsync(string? refreshToken, CancellationToken cancellationToken);
}
