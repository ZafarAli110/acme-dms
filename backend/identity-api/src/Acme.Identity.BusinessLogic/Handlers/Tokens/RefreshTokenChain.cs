using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens;

internal static class RefreshTokenChain
{
    /// <summary>Ends the sign-in: every token of the chain is refused from now on, and so is every access token it made.</summary>
    public static Task<int> RevokeAsync(IdentityDbContext dbContext, Guid familyId, DateTimeOffset now, CancellationToken cancellationToken) =>
        dbContext.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.RevokedAt, now), cancellationToken);
}
