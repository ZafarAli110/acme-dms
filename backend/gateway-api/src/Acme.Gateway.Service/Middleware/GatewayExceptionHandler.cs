using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Microsoft.AspNetCore.Diagnostics;

namespace Acme.Gateway.Service.Middleware;

/// <summary>
/// The gateway's expected failures, as identity-api's <c>ApiExceptionHandler</c> does for its own: identity-api being
/// unavailable becomes a 503 problem, so neither the controller nor the middleware catches it. A browser that left while its
/// request waited is not an error. Anything else is left alone and becomes a 500 (database errors: <c>AddAcmeDatabaseErrors</c>).
/// </summary>
public sealed class GatewayExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            // Nobody is there to answer; 499 is what the logs show for a client that closed the request.
            httpContext.Response.StatusCode = 499;
            return true;
        }

        if (exception is not IdentityUnavailableException)
        {
            return false;
        }

        await SessionProblems.WriteAsync(httpContext, StatusCodes.Status503ServiceUnavailable, SessionProblems.IdentityUnavailable);
        return true;
    }
}
