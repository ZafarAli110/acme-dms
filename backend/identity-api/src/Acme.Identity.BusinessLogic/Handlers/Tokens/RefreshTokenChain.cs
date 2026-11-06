using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens;

internal static class RefreshTokenChain
{
    /// <summary>
    /// Takes the sign-in's rows for the rest of the transaction, so a refresh, another refresh and a sign-out of the same
    /// sign-in happen one after the other. Without it a sign-out that runs between a refresh's read and its insert would
    /// revoke only the old tokens and leave the new one live. Whoever waits here then reads the state again: a statement
    /// after the lock sees what the one before it committed.
    /// </summary>
    public static Task<int> LockAsync(IdentityDbContext dbContext, Guid familyId, CancellationToken cancellationToken) =>
        dbContext.Database.ExecuteSqlInterpolatedAsync($"SELECT id FROM refresh_tokens WHERE family_id = {familyId} FOR UPDATE", cancellationToken);

    /// <summary>Ends the sign-in: every token of the chain is refused from now on, and so is every access token it made.</summary>
    public static Task<int> RevokeAsync(IdentityDbContext dbContext, Guid familyId, DateTimeOffset now, CancellationToken cancellationToken) =>
        dbContext.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.RevokedAt, now), cancellationToken);
}
