using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Acme.ServiceDefaults.Authentication;

public static class AuthenticationServiceCollectionExtensions
{
    /// <summary>Must match identity-api's TokenSettings.</summary>
    public const string Issuer = "acme-identity";

    /// <summary>Must match identity-api's TokenSettings.</summary>
    public const string Audience = "acme-dms";

    /// <summary>
    /// Validates identity-api's tokens. The signing keys come from identity-api's OpenID discovery document, found
    /// through the address Aspire injects (<c>services:identity-api:http:0</c>).
    /// </summary>
    public static IServiceCollection AddAcmeAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
        {
            var identityApiUrl = configuration["services:identity-api:http:0"];
            if (!string.IsNullOrWhiteSpace(identityApiUrl))
            {
                options.MetadataAddress = $"{identityApiUrl}/.well-known/openid-configuration";
                options.RequireHttpsMetadata = false;
            }

            options.MapInboundClaims = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = Issuer,
                ValidAudience = Audience,
                NameClaimType = "name",
            };
        });
        // Deny by default: every endpoint needs a valid token unless it is marked [AllowAnonymous].
        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
        return services;
    }
}
