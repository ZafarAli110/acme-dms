using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Delete;
using Acme.Gateway.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Gateway.BusinessLogic.Handlers.Sessions.Delete;

/// <summary>
/// Signs a browser out: the session is deleted, so from the next request on its cookie signs no one in, a copy of it included,
/// on every gateway instance. Then its refresh token ends at identity-api too, which may fail without harm.
/// </summary>
internal sealed class DeleteSessionCommandHandler : IDeleteSessionCommandHandler
{
    private readonly GatewayDbContext _dbContext;
    private readonly RefreshTokenRevoker _revoker;

    public DeleteSessionCommandHandler(GatewayDbContext dbContext, RefreshTokenRevoker revoker)
    {
        _dbContext = dbContext;
        _revoker = revoker;
    }

    public async Task ExecuteAsync(string cookieValue, CallerContext caller, CancellationToken cancellationToken)
    {
        var id = SessionSecrets.IdOf(cookieValue);
        var tokens = await _dbContext.Sessions.AsNoTracking().Where(s => s.Id == id).Select(s => s.Tokens).SingleOrDefaultAsync(cancellationToken);
        if (tokens is null)
        {
            return;
        }

        // One statement, so a session another request already ended (a second tab signing out, a renewal identity-api
        // refused) is not an error; and only the request that deleted it ends its refresh token.
        var deleted = await _dbContext.Sessions.Where(s => s.Id == id).ExecuteDeleteAsync(cancellationToken);
        if (deleted == 1 && SessionSecrets.Open(cookieValue, tokens)?.RefreshToken is { } refreshToken)
        {
            await _revoker.RevokeQuietlyAsync(refreshToken, caller);
        }
    }
}
