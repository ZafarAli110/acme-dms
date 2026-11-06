using Acme.Identity.BusinessLogic.Abstractions.Handlers.Sessions.GetRevoked;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.DTO.Sessions;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Sessions.GetRevoked;

/// <summary>
/// Which sign-ins were ended (by signing out, or by a replaced token shown again) since a moment. This is how every service
/// refuses the access tokens of an ended sign-in: it asks every few seconds and keeps the answers, so no request waits for
/// identity-api, and identity-api being down only means no new sign-ins end. An access token lives
/// <see cref="TokenSettings.LifetimeSeconds"/>, so a sign-in ended longer ago than the window can have no token that works and is
/// not listed. The ids are random and say nothing about whose they are, so the list is open to the services without a credential.
/// </summary>
internal sealed class GetRevokedSessionsQueryHandler : IGetRevokedSessionsQueryHandler
{
    private readonly IdentityDbContext _dbContext;
    private readonly TimeProvider _timeProvider;

    public GetRevokedSessionsQueryHandler(IdentityDbContext dbContext, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider;
    }

    public async Task<RevokedSessionsResponseDto> ExecuteAsync(DateTimeOffset? since, CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var earliest = now.AddSeconds(-TokenSettings.RevokedFeedWindowSeconds);
        var from = since is { } asked && asked > earliest ? asked : earliest;
        var revoked = await _dbContext.RefreshTokens
            .AsNoTracking()
            .Where(t => t.RevokedAt != null && t.RevokedAt >= from)
            .Select(t => t.FamilyId)
            .Distinct()
            .ToListAsync(cancellationToken);
        return new RevokedSessionsResponseDto(now, revoked);
    }
}
