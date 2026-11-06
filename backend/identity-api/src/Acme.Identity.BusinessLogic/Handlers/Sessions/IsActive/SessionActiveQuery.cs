using Acme.Identity.BusinessLogic.Abstractions.Handlers.Sessions.IsActive;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Sessions.IsActive;

internal sealed class SessionActiveQuery : ISessionActiveQuery
{
    private readonly IdentityDbContext _dbContext;
    private readonly TimeProvider _timeProvider;

    public SessionActiveQuery(IdentityDbContext dbContext, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider;
    }

    /// <summary>Signing out revokes every token of the chain, so "any token still good" is "the sign-in is open".</summary>
    public Task<bool> ExecuteAsync(Guid sessionId, CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        return _dbContext.RefreshTokens.AnyAsync(
            t => t.FamilyId == sessionId && t.RevokedAt == null && t.ExpiresAt > now, cancellationToken);
    }
}
