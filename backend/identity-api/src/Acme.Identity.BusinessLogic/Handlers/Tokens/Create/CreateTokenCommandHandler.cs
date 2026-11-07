using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens;
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
    private static readonly User _unknownUser = new();
    private static readonly Lazy<string> _unknownUserHash = new(() => new PasswordHasher<User>().HashPassword(_unknownUser, Guid.NewGuid().ToString()));
    private readonly IdentityDbContext _dbContext;
    private readonly AccessTokenIssuer _accessTokenIssuer;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly SignInThrottle _signInThrottle;
    private readonly TimeProvider _timeProvider;

    public CreateTokenCommandHandler(
        IdentityDbContext dbContext,
        AccessTokenIssuer accessTokenIssuer,
        IPasswordHasher<User> passwordHasher,
        SignInThrottle signInThrottle,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _accessTokenIssuer = accessTokenIssuer;
        _passwordHasher = passwordHasher;
        _signInThrottle = signInThrottle;
        _timeProvider = timeProvider;
    }

    public async Task<IssuedTokens> ExecuteAsync(TokenCreateRequestDto request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Emails are stored lower-case, so an exact match is a case-insensitive match.
        var email = request.Email.Trim().ToLowerInvariant();
        var wait = _signInThrottle.Begin(email);
        if (wait > TimeSpan.Zero)
        {
            var seconds = (int)Math.Ceiling(wait.TotalSeconds);
            throw new ApiException(ApiErrorCategory.TooManyRequests, $"Too many sign-in attempts. Try again in {seconds} seconds.", seconds);
        }

        var user = await _dbContext.Users
            .Include(u => u.Dealer)
            .Include(u => u.LocationRoles).ThenInclude(r => r.Location)
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is null)
        {
            // An unknown email costs the same as a wrong password: a hash is checked either way, so the time does not say
            // which emails have an account.
            _passwordHasher.VerifyHashedPassword(_unknownUser, _unknownUserHash.Value, request.Password);
            throw new ApiException(ApiErrorCategory.Unauthorized, InvalidCredentials);
        }

        if (_passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
        {
            // Already counted when the attempt began.
            throw new ApiException(ApiErrorCategory.Unauthorized, InvalidCredentials);
        }

        _signInThrottle.RecordSuccess(email);

        var now = _timeProvider.GetUtcNow();
        // A sign-in starts a chain of refresh tokens: its id is the access tokens' `sid`, and its refresh tokens end after the lifetime.
        var sessionId = Guid.CreateVersion7();
        var accessToken = await _accessTokenIssuer.IssueAsync(user, sessionId, now, cancellationToken);

        // Tokens that can no longer be used are cleared as people sign in: the table stays as small as the people at work.
        await _dbContext.RefreshTokens
            .Where(t => t.UserId == user.Id && (t.ExpiresAt <= now || t.RevokedAt != null))
            .ExecuteDeleteAsync(cancellationToken);
        var refreshToken = RefreshTokenSecret.Create();
        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            Id = sessionId,
            FamilyId = sessionId,
            UserId = user.Id,
            TokenHash = RefreshTokenSecret.Hash(refreshToken),
            CreatedAt = now,
            ExpiresAt = now.AddSeconds(TokenSettings.RefreshLifetimeSeconds),
        });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new IssuedTokens(new TokenCreateResponseDto(accessToken, "Bearer", TokenSettings.LifetimeSeconds), refreshToken);
    }
}
