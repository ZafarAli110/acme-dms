using Acme.Gateway.BusinessLogic.Abstractions.RestClients;

namespace Acme.Gateway.Service.Authorization;

/// <summary>Who the gateway acts for when it calls identity-api, read from the request (handlers never read HTTP).</summary>
internal static class CallerContextFactory
{
    /// <summary>
    /// The browser's address (after <c>UseForwardedHeaders</c>, the one a trusted load balancer reports) and its language.
    /// </summary>
    public static CallerContext From(HttpContext context) =>
        new(context.Connection.RemoteIpAddress?.ToString(), context.Request.Headers.AcceptLanguage.ToString());
}
