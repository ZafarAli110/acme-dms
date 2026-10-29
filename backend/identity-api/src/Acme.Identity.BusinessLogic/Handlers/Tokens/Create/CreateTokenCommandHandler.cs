using System.Security.Claims;
using System.Text.Json;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Handlers.Users;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens.Create;

internal sealed class CreateTokenCommandHandler : ICreateTokenCommandHandler
{
    private const string InvalidCredentials = "Email or password is incorrect.";
    private static readonly JsonSerializerOptions ClaimJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IdentityDbContext _dbContext;
    private readonly ISigningKeyProvider _signingKeyProvider;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly TimeProvider _timeProvider;

    public CreateTokenCommandHandler(
        IdentityDbContext dbContext,
        ISigningKeyProvider signingKeyProvider,
        IPasswordHasher<User> passwordHasher,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _signingKeyProvider = signingKeyProvider;
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

        var signingKey = await _signingKeyProvider.GetSigningKeyAsync(cancellationToken);
        var now = _timeProvider.GetUtcNow();
        var locations = UserLocationMapper.ToUserLocationDtos(user)
            .Select(l => new { id = l.Id, code = l.Code, name = l.Name, role = l.Role, permissions = l.Permissions });

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = TokenSettings.Issuer,
            Audience = TokenSettings.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = now.AddSeconds(TokenSettings.LifetimeSeconds).UtcDateTime,
            SigningCredentials = new SigningCredentials(signingKey, SecurityAlgorithms.RsaSha256),
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(JwtRegisteredClaimNames.Name, user.DisplayName),
                new Claim("dealer_id", user.DealerId.ToString()),
                new Claim("dealer_name", user.Dealer?.Name ?? string.Empty),
            ]),
            Claims = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["locations"] = JsonSerializer.SerializeToElement(locations, ClaimJsonOptions),
            },
        };

        var accessToken = new JsonWebTokenHandler().CreateToken(descriptor);
        return new TokenCreateResponseDto(accessToken, "Bearer", TokenSettings.LifetimeSeconds);
    }
}
