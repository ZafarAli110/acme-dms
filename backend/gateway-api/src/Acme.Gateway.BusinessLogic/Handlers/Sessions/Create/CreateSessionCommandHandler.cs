using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Create;
using Acme.Gateway.DTO.Sessions;
using Acme.Gateway.Persistence.Database;
using Acme.Gateway.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Acme.Gateway.BusinessLogic.Handlers.Sessions.Create;

/// <summary>
/// Signs a browser in: identity-api checks the password, and what it issues is kept in a new session, encrypted with the new
/// cookie's value. The session the browser had ends in the same save, and its refresh token at identity-api after it.
/// </summary>
internal sealed class CreateSessionCommandHandler : ICreateSessionCommandHandler
{
    private readonly GatewayDbContext _dbContext;
    private readonly IIdentityClient _identityClient;
    private readonly RefreshTokenRevoker _revoker;
    private readonly TimeProvider _timeProvider;

    public CreateSessionCommandHandler(GatewayDbContext dbContext, IIdentityClient identityClient, RefreshTokenRevoker revoker, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _identityClient = identityClient;
        _revoker = revoker;
        _timeProvider = timeProvider;
    }

    public async Task<CreateSessionResult> ExecuteAsync(
        SessionCreateRequestDto request,
        string? replacedCookie,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        // The call to identity-api comes first, outside any transaction.
        var signedIn = await _identityClient.SignInAsync(request.Email, request.Password, caller, cancellationToken);
        if (signedIn.Tokens is not { } issued)
        {
            return new CreateSessionResult(null, signedIn.Refusal);
        }

        var now = _timeProvider.GetUtcNow();
        // Sessions that ran out are cleared as people sign in: the table stays as small as the people at work.
        await _dbContext.Sessions.Where(s => s.ExpiresAt <= now).ExecuteDeleteAsync(cancellationToken);

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        string? replacedRefreshToken = null;
        if (replacedCookie is not null)
        {
            var replacedId = SessionSecrets.IdOf(replacedCookie);
            var replacedTokens = await _dbContext.Sessions.AsNoTracking().Where(s => s.Id == replacedId).Select(s => s.Tokens).SingleOrDefaultAsync(cancellationToken);
            // A session another request already ended is not an error; only the request that deleted it ends its token.
            if (replacedTokens is not null && await _dbContext.Sessions.Where(s => s.Id == replacedId).ExecuteDeleteAsync(cancellationToken) == 1)
            {
                replacedRefreshToken = SessionSecrets.Open(replacedCookie, replacedTokens)?.RefreshToken;
            }
        }

        var value = SessionSecrets.NewValue();
        _dbContext.Sessions.Add(new Session
        {
            Id = SessionSecrets.IdOf(value),
            UserId = issued.UserId,
            Tokens = SessionSecrets.Seal(value, new SessionTokens(issued.AccessToken, issued.RefreshToken)),
            AccessTokenExpiresAt = issued.AccessTokenExpiresAt,
            CreatedAt = now,
            ExpiresAt = now.Add(SessionSettings.Lifetime),
        });
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        if (replacedRefreshToken is not null)
        {
            await _revoker.RevokeQuietlyAsync(replacedRefreshToken, caller);
        }

        return new CreateSessionResult(value, null);
    }
}
