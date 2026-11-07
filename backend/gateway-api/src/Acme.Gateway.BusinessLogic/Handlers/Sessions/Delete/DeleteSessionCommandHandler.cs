using Acme.Gateway.BusinessLogic.Abstractions.Clients;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Delete;
using Acme.Gateway.BusinessLogic.Sessions;
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
        var session = await _dbContext.Sessions.SingleOrDefaultAsync(s => s.Id == id, cancellationToken);
        if (session is null)
        {
            return;
        }

        _dbContext.Sessions.Remove(session);
        await _dbContext.SaveChangesAsync(cancellationToken);
        if (SessionSecrets.Open(cookieValue, session.Tokens)?.RefreshToken is { } refreshToken)
        {
            await _revoker.RevokeQuietlyAsync(refreshToken, caller);
        }
    }
}
