using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Refresh;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens.Refresh;

/// <summary>
/// Trades a refresh token for a new access token. The person is read again: their roles and locations as they are now,
/// and a person who no longer exists signs nothing. A token that is unknown, revoked or past its lifetime is refused
/// the same way, so the answer does not say which.
/// </summary>
internal sealed class RefreshTokenCommandHandler : IRefreshTokenCommandHandler
{
    private const string SessionEnded = "Your session has ended. Sign in again.";

    private readonly IdentityDbContext _dbContext;
    private readonly AccessTokenIssuer _accessTokenIssuer;
    private readonly TimeProvider _timeProvider;

    public RefreshTokenCommandHandler(IdentityDbContext dbContext, AccessTokenIssuer accessTokenIssuer, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _accessTokenIssuer = accessTokenIssuer;
        _timeProvider = timeProvider;
    }

    public async Task<TokenRefreshResponseDto> ExecuteAsync(TokenRefreshRequestDto request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = _timeProvider.GetUtcNow();
        var hash = RefreshTokenSecret.Hash(request.RefreshToken);
        var token = await _dbContext.RefreshTokens
            .AsNoTracking()
            .SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (token is null || token.RevokedAt is not null || token.ExpiresAt <= now)
        {
            throw new ApiException(ApiErrorCategory.Unauthorized, SessionEnded);
        }

        // The query filters hide a deleted user: no one to sign.
        var user = await _dbContext.Users
            .Include(u => u.Dealer)
            .Include(u => u.LocationRoles).ThenInclude(r => r.Location)
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Id == token.UserId, cancellationToken);
        if (user is null)
        {
            throw new ApiException(ApiErrorCategory.Unauthorized, SessionEnded);
        }

        var accessToken = await _accessTokenIssuer.IssueAsync(user, now, cancellationToken);
        return new TokenRefreshResponseDto(accessToken, "Bearer", TokenSettings.LifetimeSeconds);
    }
}
