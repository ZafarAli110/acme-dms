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

        // A service refuses the access tokens of sign-ins identity-api has ended, from a list it keeps (RevokedSessionsFeed);
        // identity-api registers its own answer (from its database) first, and then asks no one.
        if (!services.Any(service => service.ServiceType == typeof(ISessionStatusChecker)))
        {
            services.TryAddSingleton(TimeProvider.System);
            // A slow identity-api must not hold the service's start for the HttpClient default of 100 seconds.
            services.AddHttpClient(nameof(RevokedSessionsFeed), client => client.Timeout = TimeSpan.FromSeconds(2));
            // One instance: the hook reads what the hosted service keeps up to date.
            services.AddSingleton(provider => new RevokedSessionsFeed(
                provider.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(RevokedSessionsFeed)),
                provider.GetRequiredService<TimeProvider>(),
                provider.GetRequiredService<IConfiguration>(),
                provider.GetRequiredService<ILogger<RevokedSessionsFeed>>()));
            services.AddSingleton<ISessionStatusChecker>(provider => provider.GetRequiredService<RevokedSessionsFeed>());
            services.AddHostedService(provider => provider.GetRequiredService<RevokedSessionsFeed>());
        }

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
    /// even though it has not expired. A token with no sign-in id (<c>sid</c>) is refused too: every token identity-api issues
    /// has one, and one without could never be ended.
    /// </summary>
    public static async Task EndedSessionsAreRefusedAsync(TokenValidatedContext context)
    {
        if (context.SecurityToken is not JsonWebToken token)
        {
            context.Fail("The access token is not one this service issues.");
            return;
        }

        if (!Guid.TryParse(context.Principal?.FindFirst("sid")?.Value, out var sessionId))
        {
            context.Fail("The access token has no sign-in.");
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
