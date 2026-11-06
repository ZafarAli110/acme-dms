using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Revoke;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens.Revoke;

/// <summary>
/// Ends a sign-in: the whole chain of refresh tokens is refused from now on, and so are the access tokens it made (the
/// services ask identity-api whether the sign-in is open). Whoever holds a token may end it; a token that is unknown or
/// already ended is not an error, so signing out cannot fail.
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
            .Where(t => t.TokenHash == hash)
            .Select(t => (Guid?)t.FamilyId)
            .SingleOrDefaultAsync(cancellationToken);
        if (familyId is not null)
        {
            await RefreshTokenChain.RevokeAsync(_dbContext, familyId.Value, _timeProvider.GetUtcNow(), cancellationToken);
        }
    }
}
