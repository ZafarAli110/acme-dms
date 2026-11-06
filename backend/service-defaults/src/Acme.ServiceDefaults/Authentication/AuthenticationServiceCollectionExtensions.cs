using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.JsonWebTokens;
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

        // A service asks identity-api whether a token's sign-in is open; identity-api registers its own answer first.
        services.AddMemoryCache();
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton<SessionStatusCache>();
        services.AddHttpClient<HttpSessionStatusChecker>();
        services.TryAddScoped<ISessionStatusChecker>(provider => provider.GetRequiredService<HttpSessionStatusChecker>());

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
            options.Events = new JwtBearerEvents
            {
                OnTokenValidated = EndedSessionsAreRefusedAsync,
            };
        });
        // Deny by default: every endpoint needs a valid token unless it is marked [AllowAnonymous].
        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
        return services;
    }

    /// <summary>
    /// A token whose sign-in was ended (the person signed out, or a replaced refresh token was used again) is refused
    /// even though it has not expired. Tokens issued before sign-ins had an id (no <c>sid</c>) are checked by expiry alone.
    /// </summary>
    private static async Task EndedSessionsAreRefusedAsync(TokenValidatedContext context)
    {
        if (!Guid.TryParse(context.Principal?.FindFirst("sid")?.Value, out var sessionId) || context.SecurityToken is not JsonWebToken token)
        {
            return;
        }

        var checker = context.HttpContext.RequestServices.GetRequiredService<ISessionStatusChecker>();
        var session = new AccessTokenSession(sessionId, token.EncodedToken, token.ValidTo);
        if (!await checker.IsActiveAsync(session, context.HttpContext.RequestAborted))
        {
            context.Fail("The sign-in has ended.");
        }
    }
}
