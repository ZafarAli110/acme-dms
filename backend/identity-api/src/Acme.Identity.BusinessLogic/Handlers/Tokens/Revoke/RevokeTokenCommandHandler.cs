using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Revoke;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens.Revoke;

/// <summary>
/// Ends a sign-in: the whole chain of refresh tokens is refused from now on. The access tokens it made are not: the
/// services check them by their signature alone, so one lives out its few minutes. Whoever holds a token may end it; a
/// token that is unknown or already ended is not an error, so signing out cannot fail.
/// </summary>
internal sealed class RevokeTokenCommandHandler : IRevokeTokenCommandHandler
{
    private readonly IdentityDbContext _dbContext;
    private readonly TimeProvider _timeProvider;

    public RevokeTokenCommandHandler(IdentityDbContext dbContext, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider;
    }

    public async Task ExecuteAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return;
        }

        var hash = RefreshTokenSecret.Hash(refreshToken);
        var familyId = await _dbContext.RefreshTokens
            .AsNoTracking()
            .Where(t => t.TokenHash == hash)
            .Select(t => (Guid?)t.FamilyId)
            .SingleOrDefaultAsync(cancellationToken);
        if (familyId is null)
        {
            return;
        }

        // Behind a refresh of this sign-in that is running, so the token it makes is revoked too: the lock, then a new
        // statement, which sees what that refresh committed.
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        await RefreshTokenChain.LockAsync(_dbContext, familyId.Value, cancellationToken);
        await RefreshTokenChain.RevokeAsync(_dbContext, familyId.Value, _timeProvider.GetUtcNow(), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }
}
