using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Refresh;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens.Refresh;

/// <summary>
/// Trades a refresh token for a new access token and the refresh token that replaces it. The person is read again: their
/// roles and locations as they are now, and a person who no longer exists signs nothing. A token that is unknown, revoked
/// or past its lifetime is refused the same way, so the answer does not say which.
///
/// A token that was already replaced is the sign of a copy: a second holder. Within the grace period it is taken for the
/// same person's second request racing the first (a retry, two tabs) and is answered; after it the whole sign-in ends.
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

    public async Task<IssuedTokens> ExecuteAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            throw new ApiException(ApiErrorCategory.Unauthorized, SessionEnded);
        }

        var now = _timeProvider.GetUtcNow();
        var hash = RefreshTokenSecret.Hash(refreshToken);
        var current = await _dbContext.RefreshTokens.AsNoTracking().SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (current is null || current.RevokedAt is not null || current.ExpiresAt <= now)
        {
            throw new ApiException(ApiErrorCategory.Unauthorized, SessionEnded);
        }

        if (current.RotatedAt is not null && now - current.RotatedAt > TimeSpan.FromSeconds(TokenSettings.RefreshReuseGraceSeconds))
        {
            // Replaced long ago and shown again: someone else has a copy. Nobody keeps this sign-in, not even its owner.
            await RefreshTokenChain.RevokeAsync(_dbContext, current.FamilyId, now, cancellationToken);
            throw new ApiException(ApiErrorCategory.Unauthorized, SessionEnded);
        }

        // The query filters hide a deleted user: no one to sign.
        var user = await _dbContext.Users
            .Include(u => u.Dealer)
            .Include(u => u.LocationRoles).ThenInclude(r => r.Location)
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Id == current.UserId, cancellationToken);
        if (user is null)
        {
            throw new ApiException(ApiErrorCategory.Unauthorized, SessionEnded);
        }

        var accessToken = await _accessTokenIssuer.IssueAsync(user, current.FamilyId, now, cancellationToken);

        var next = RefreshTokenSecret.Create();
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        if (current.RotatedAt is null)
        {
            await _dbContext.RefreshTokens
                .Where(t => t.Id == current.Id && t.RotatedAt == null)
                .ExecuteUpdateAsync(set => set.SetProperty(t => t.RotatedAt, now), cancellationToken);
        }

        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            UserId = current.UserId,
            FamilyId = current.FamilyId,
            TokenHash = RefreshTokenSecret.Hash(next),
            CreatedAt = now,
            // The sign-in ends when it was going to, however often it is renewed.
            ExpiresAt = current.ExpiresAt,
        });
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new IssuedTokens(new TokenCreateResponseDto(accessToken, "Bearer", TokenSettings.LifetimeSeconds), next);
    }
}
