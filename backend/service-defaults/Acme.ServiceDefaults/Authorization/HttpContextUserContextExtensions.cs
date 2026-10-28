using Acme.ServiceDefaults.Middleware;

namespace Acme.ServiceDefaults.Authorization;

public static class HttpContextUserContextExtensions
{
    /// <summary>The user context resolved by <see cref="UserContextMiddleware"/>; throws on anonymous requests.</summary>
    public static AcmeUserContext GetUserContext(this HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        return context.Items.TryGetValue(UserContextMiddleware.ItemKey, out var userContext) && userContext is AcmeUserContext acmeUserContext
            ? acmeUserContext
            : throw new InvalidOperationException("No user context on this request: is the endpoint anonymous?");
    }

    /// <summary>The user context, or null on anonymous requests and outside HTTP requests (e.g. background work).</summary>
    public static AcmeUserContext? FindUserContext(this HttpContext? context) =>
        context is not null && context.Items.TryGetValue(UserContextMiddleware.ItemKey, out var userContext) ? userContext as AcmeUserContext : null;
}
