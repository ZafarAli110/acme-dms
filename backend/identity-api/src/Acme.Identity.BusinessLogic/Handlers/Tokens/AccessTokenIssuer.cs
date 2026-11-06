using System.Security.Claims;
using System.Text.Json;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Handlers.Users;
using Acme.Identity.Persistence.Entities;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens;

/// <summary>
/// Signs an access token for a user, from what the database says about them now (their dealer, their locations and the
/// permissions of their role at each). Signing in and refreshing both come here, so a refreshed token is never older
/// news than a new one.
/// </summary>
internal sealed class AccessTokenIssuer
{
    private static readonly JsonSerializerOptions _claimJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ISigningKeyProvider _signingKeyProvider;

    public AccessTokenIssuer(ISigningKeyProvider signingKeyProvider)
    {
        _signingKeyProvider = signingKeyProvider;
    }

    /// <summary>The user must be loaded with their dealer and their location roles (with the locations). <paramref name="sessionId"/> is the sign-in's chain of refresh tokens.</summary>
    public async Task<string> IssueAsync(User user, Guid sessionId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var signingKey = await _signingKeyProvider.GetSigningKeyAsync(cancellationToken);
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
                // The sign-in this token belongs to: services ask identity-api whether it is still open (sessions/current).
                new Claim(JwtRegisteredClaimNames.Sid, sessionId.ToString()),
                new Claim("dealer_id", user.DealerId.ToString()),
                new Claim("dealer_name", user.Dealer?.Name ?? string.Empty),
            ]),
            Claims = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["locations"] = JsonSerializer.SerializeToElement(locations, _claimJsonOptions),
            },
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
