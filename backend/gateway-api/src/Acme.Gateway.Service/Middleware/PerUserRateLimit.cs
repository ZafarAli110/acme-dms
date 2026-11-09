using System.Globalization;
using System.Threading.RateLimiting;
using Acme.Gateway.Service.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Net.Http.Headers;

namespace Acme.Gateway.Service.Middleware;

/// <summary>
/// A fair share of the system for each user: a busy morning is many people each making a few requests, so one browser in
/// a loop or one script must not slow everyone else down. Two shares, and a request needs both:
/// <list type="bullet">
/// <item>each sign-in (its session cookie, else a script's own token) gets a bucket of <c>RateLimit:Burst</c> requests,
/// refilled at <c>RateLimit:RequestsPerSecond</c>;</item>
/// <item>each address gets a larger one (<c>RateLimit:AddressBurst</c>, refilled at <c>RateLimit:AddressRequestsPerSecond</c>):
/// the cookie and the token are whatever the client sends, so a flood with a made-up one on every request would get a
/// fresh bucket each time. The address share stops it. It is large because a whole dealership can sit behind one address.</item>
/// </list>
/// Past either, the gateway answers 429 with <c>Retry-After</c> itself, before it looks the session up or calls a service.
/// Only <c>/api/…</c> counts: the health check and the gateway's own pages do not. The address is the browser's only when
/// <c>UseForwardedHeaders</c> trusts the proxy in front (<c>ForwardedHeaders__KnownProxies</c>); otherwise everyone shares
/// the proxy's. The buckets live in each gateway's memory: with several gateways a client spread across them gets a
/// little more, which is fine for fairness (a quota that is billed would need a shared store).
/// </summary>
internal static class PerUserRateLimit
{
    public const string TooMany = "Too many requests. Wait a moment and try again.";

    public static IServiceCollection AddPerUserRateLimit(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection("RateLimit");
        var perSignIn = Bucket(section.GetValue("Burst", 100), section.GetValue("RequestsPerSecond", 20));
        var perAddress = Bucket(section.GetValue("AddressBurst", 2000), section.GetValue("AddressRequestsPerSecond", 500));
        return services.AddRateLimiter(options =>
        {
            // The default is 503, which says the system is down; this says the caller asked too much.
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.CreateChained(
                PartitionedRateLimiter.Create<HttpContext, string>(context => SignInPartition(context, perSignIn)),
                PartitionedRateLimiter.Create<HttpContext, string>(context => AddressPartition(context, perAddress)));
            options.OnRejected = (rejected, _) =>
            {
                var seconds = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
                    ? Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds))
                    : 1;
                rejected.HttpContext.Response.Headers[HeaderNames.RetryAfter] = seconds.ToString(CultureInfo.InvariantCulture);
                return new ValueTask(SessionProblems.WriteAsync(rejected.HttpContext, StatusCodes.Status429TooManyRequests, TooMany));
            };
        });
    }

    private static TokenBucketRateLimiterOptions Bucket(int burst, int perSecond) => new()
    {
        TokenLimit = burst,
        TokensPerPeriod = perSecond,
        ReplenishmentPeriod = TimeSpan.FromSeconds(1),
        QueueLimit = 0,
        AutoReplenishment = true,
    };

    private static RateLimitPartition<string> SignInPartition(HttpContext context, TokenBucketRateLimiterOptions bucket)
    {
        var request = context.Request;
        if (!request.Path.StartsWithSegments(SessionPaths.Api))
        {
            return RateLimitPartition.GetNoLimiter("not-api");
        }

        var key = SessionCookie.ValueOf(request) is { } cookie
            ? $"session:{cookie}"
            : request.Headers.Authorization.Count > 0
                ? $"token:{request.Headers.Authorization}"
                : null;
        return key is null
            ? RateLimitPartition.GetNoLimiter("no-sign-in")
            : RateLimitPartition.GetTokenBucketLimiter(key, _ => bucket);
    }

    private static RateLimitPartition<string> AddressPartition(HttpContext context, TokenBucketRateLimiterOptions bucket) =>
        context.Request.Path.StartsWithSegments(SessionPaths.Api)
            ? RateLimitPartition.GetTokenBucketLimiter($"address:{context.Connection.RemoteIpAddress}", _ => bucket)
            : RateLimitPartition.GetNoLimiter("not-api");
}
