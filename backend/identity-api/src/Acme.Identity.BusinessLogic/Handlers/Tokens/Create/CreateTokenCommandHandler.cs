using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens.Create;

internal sealed class CreateTokenCommandHandler : ICreateTokenCommandHandler
{
    private const string InvalidCredentials = "Email or password is incorrect.";
    private readonly IdentityDbContext _dbContext;
    private readonly AccessTokenIssuer _accessTokenIssuer;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly TimeProvider _timeProvider;

    public CreateTokenCommandHandler(
        IdentityDbContext dbContext,
        AccessTokenIssuer accessTokenIssuer,
        IPasswordHasher<User> passwordHasher,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _accessTokenIssuer = accessTokenIssuer;
        _passwordHasher = passwordHasher;
        _timeProvider = timeProvider;
    }

    public async Task<TokenCreateResponseDto> ExecuteAsync(TokenCreateRequestDto request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Emails are stored lower-case, so an exact match is a case-insensitive match.
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _dbContext.Users
            .Include(u => u.Dealer)
            .Include(u => u.LocationRoles).ThenInclude(r => r.Location)
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is null || _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
        {
            throw new ApiException(ApiErrorCategory.Unauthorized, InvalidCredentials);
        }

        var now = _timeProvider.GetUtcNow();
        var accessToken = await _accessTokenIssuer.IssueAsync(user, now, cancellationToken);

        // Tokens that can no longer be used are cleared as people sign in: the table stays as small as the people at work.
        await _dbContext.RefreshTokens
            .Where(t => t.UserId == user.Id && (t.ExpiresAt <= now || t.RevokedAt != null))
            .ExecuteDeleteAsync(cancellationToken);
        var refreshToken = RefreshTokenSecret.Create();
        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = RefreshTokenSecret.Hash(refreshToken),
            CreatedAt = now,
            ExpiresAt = now.AddSeconds(TokenSettings.RefreshLifetimeSeconds),
        });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new TokenCreateResponseDto(accessToken, "Bearer", TokenSettings.LifetimeSeconds, refreshToken);
    }
}
