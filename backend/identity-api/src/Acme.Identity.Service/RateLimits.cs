using System.Threading.RateLimiting;
using Acme.ServiceDefaults.ProblemDetails;
using Microsoft.AspNetCore.RateLimiting;

namespace Acme.Identity.Service;

/// <summary>
/// How often one address may call the unauthenticated endpoints. The address is the caller's, as the gateway forwards it
/// (<c>X-Forwarded-For</c>, see Program.cs): without that every request would come from the gateway and the limit would
/// count everyone as one. Per-account guessing is slowed separately (SignInThrottle), because many addresses can try one account.
/// </summary>
public static class RateLimits
{
    public const string SignIn = "sign-in";
    public const string Token = "token";
    public const string Feed = "feed";

    public static IServiceCollection AddAcmeRateLimits(this IServiceCollection services) =>
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(SignIn, context => PerAddress(context, permits: 10));
            options.AddPolicy(Token, context => PerAddress(context, permits: 120));
            // Every service instance asks every few seconds: well under this, and far under what would be an attack.
            options.AddPolicy(Feed, context => PerAddress(context, permits: 120));
            options.OnRejected = async (context, cancellationToken) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
                }

                var problem = ProblemDetailsDtoFactory.Create(context.HttpContext, StatusCodes.Status429TooManyRequests, "Too many requests. Try again shortly.");
                await context.HttpContext.Response.WriteAsJsonAsync(problem, (System.Text.Json.JsonSerializerOptions?)null, "application/problem+json", cancellationToken);
            };
        });

    private static RateLimitPartition<string> PerAddress(HttpContext context, int permits) =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
}
