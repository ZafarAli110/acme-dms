using System.Net;
using System.Net.Sockets;
using System.Threading.RateLimiting;
using Acme.ServiceDefaults.ProblemDetails;
using Microsoft.AspNetCore.RateLimiting;

namespace Acme.Identity.Service;

/// <summary>
/// How often one address may call the unauthenticated endpoints. The address is the caller's, as the gateway forwards it
/// (<c>X-Forwarded-For</c>, see Program.cs): without that every request would come from the gateway and the limit would
/// count everyone as one. Per-account guessing is slowed separately (SignInThrottle), because many addresses can try one account.
/// Sign-ins per address per minute are a setting (<c>RateLimits:SignInPerMinute</c>, 10 by default) only so that a load test,
/// which signs many people in from one machine, can raise it (<c>bun run start:prod --load-test</c>); production keeps 10.
/// </summary>
public static class RateLimits
{
    public const string SignIn = "sign-in";
    public const string Token = "token";
    public const int DefaultSignInPerMinute = 10;

    public static IServiceCollection AddAcmeRateLimits(this IServiceCollection services, IConfiguration configuration)
    {
        var signInPerMinute = SignInPerMinute(configuration);
        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(SignIn, context => PerAddress(context, permits: signInPerMinute));
            options.AddPolicy(Token, context => PerAddress(context, permits: 120));
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
    }

    /// <summary>Sign-ins one address may make a minute: <c>RateLimits:SignInPerMinute</c> when it is a positive number, else the default.</summary>
    public static int SignInPerMinute(IConfiguration configuration) =>
        configuration.GetValue<int?>("RateLimits:SignInPerMinute") is int permits and > 0 ? permits : DefaultSignInPerMinute;

    private static RateLimitPartition<string> PerAddress(HttpContext context, int permits) =>
        RateLimitPartition.GetFixedWindowLimiter(
            AddressKey(context.Connection.RemoteIpAddress),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });

    /// <summary>
    /// What one caller is counted by. An IPv4 address as it is. An IPv6 address by its /64: one home or office network gets
    /// a whole /64, and counting each address of it would let one caller switch addresses without end.
    /// </summary>
    public static string AddressKey(IPAddress? address)
    {
        if (address is null)
        {
            return "unknown";
        }

        if (address.IsIPv4MappedToIPv6)
        {
            return address.MapToIPv4().ToString();
        }

        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return address.ToString();
        }

        var network = address.GetAddressBytes();
        Array.Clear(network, 8, 8);
        return $"{new IPAddress(network)}/64";
    }
}
