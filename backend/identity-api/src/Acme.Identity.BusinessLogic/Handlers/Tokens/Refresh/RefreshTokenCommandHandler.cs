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
/// same person's second request racing the first (the answer to the first was lost, or two requests were sent together):
/// it gets an access token and the SAME replacement the first request got, while that replacement is still unused, so a
/// lost answer costs nothing. A copy used inside the window ends up with the same replacement as the owner: whichever of
/// the two uses it second shows a replaced token after the grace period, and the whole sign-in ends. After the grace
/// period the whole sign-in ends at once.
/// </summary>
internal sealed class RefreshTokenCommandHandler : IRefreshTokenCommandHandler
{
    private const string SessionEnded = "Your session has ended. Sign in again.";

    /// <summary>A replaced token is kept this long, to tell a copy from the owner; the sign-in's older tokens are removed.</summary>
    private static readonly TimeSpan _replacedKeptFor = TimeSpan.FromHours(1);

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
        var found = await _dbContext.RefreshTokens.AsNoTracking().SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (found is null)
        {
            throw new ApiException(ApiErrorCategory.Unauthorized, SessionEnded);
        }

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        // One at a time per sign-in (with other refreshes, and with signing out); then read the token again.
        await RefreshTokenChain.LockAsync(_dbContext, found.FamilyId, cancellationToken);
        var current = await _dbContext.RefreshTokens.AsNoTracking().SingleAsync(t => t.Id == found.Id, cancellationToken);
        if (current.RevokedAt is not null || current.ExpiresAt <= now)
        {
            throw new ApiException(ApiErrorCategory.Unauthorized, SessionEnded);
        }

        var replacedFor = now - current.RotatedAt;
        if (replacedFor > TimeSpan.FromSeconds(TokenSettings.RefreshReuseGraceSeconds))
        {
            // Replaced long ago and shown again: someone else has a copy. Nobody keeps this sign-in, not even its owner.
            await RefreshTokenChain.RevokeAsync(_dbContext, current.FamilyId, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
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
        var response = new TokenCreateResponseDto(accessToken, "Bearer", TokenSettings.LifetimeSeconds);
        if (current.RotatedAt is not null)
        {
            // The grace period: no second replacement is made. The one already made is given again while it is unused.
            var again = await UnusedReplacementAsync(refreshToken, current, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new IssuedTokens(response, again);
        }

        var next = RefreshTokenSecret.Create();
        var nextSealed = RefreshTokenSecret.SealNext(refreshToken, next);
        await _dbContext.RefreshTokens
            .Where(t => t.Id == current.Id)
            .ExecuteUpdateAsync(
                set => set.SetProperty(t => t.RotatedAt, now).SetProperty(t => t.NextTokenSealed, nextSealed),
                cancellationToken);
        // The chain stays short: what was replaced long ago can no longer tell a copy from the owner.
        await _dbContext.RefreshTokens
            .Where(t => t.FamilyId == current.FamilyId && t.RotatedAt != null && t.RotatedAt < now - _replacedKeptFor)
            .ExecuteDeleteAsync(cancellationToken);
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

        return new IssuedTokens(response, next);
    }

    /// <summary>The token that replaced this one, when it has not been used or revoked since; otherwise null.</summary>
    private async Task<string?> UnusedReplacementAsync(string refreshToken, RefreshToken current, CancellationToken cancellationToken)
    {
        if (current.NextTokenSealed is not { } sealedNext || RefreshTokenSecret.OpenNext(refreshToken, sealedNext) is not { } next)
        {
            return null;
        }

        var nextHash = RefreshTokenSecret.Hash(next);
        var unused = await _dbContext.RefreshTokens.AnyAsync(
            t => t.TokenHash == nextHash && t.RotatedAt == null && t.RevokedAt == null,
            cancellationToken);
        return unused ? next : null;
    }
}
