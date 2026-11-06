using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Revoke;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens.Revoke;

/// <summary>
/// Ends a sign-in: the refresh token is never accepted again, so the access token it made is the last, and it ends
/// within minutes. Whoever holds the token may end it; a token that is unknown or already ended is not an error, so
/// signing out cannot fail.
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

    public async Task ExecuteAsync(TokenRevokeRequestDto request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = _timeProvider.GetUtcNow();
        var hash = RefreshTokenSecret.Hash(request.RefreshToken);
        await _dbContext.RefreshTokens
            .Where(t => t.TokenHash == hash && t.RevokedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.RevokedAt, now), cancellationToken);
    }
}
