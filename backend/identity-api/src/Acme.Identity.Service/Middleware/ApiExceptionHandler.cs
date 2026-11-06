using System.Text.Json;
using Acme.ServiceDefaults.ProblemDetails;
using Microsoft.AspNetCore.Diagnostics;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;

namespace Acme.Identity.Service.Middleware;

/// <summary>
/// Turns an <see cref="ApiException"/> from a business handler into the Acme problem details contract, so controllers
/// only call the handler and return its result. Any other exception is left alone and becomes a 500.
/// </summary>
public sealed class ApiExceptionHandler : IExceptionHandler
{
    private static readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        if (exception is not ApiException apiException)
        {
            return false;
        }

        var status = (int)apiException.Category;
        httpContext.Response.StatusCode = status;
        if (apiException.RetryAfterSeconds is { } retryAfter)
        {
            httpContext.Response.Headers.RetryAfter = retryAfter.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        var problem = ProblemDetailsDtoFactory.Create(httpContext, status, apiException.Message);
        await httpContext.Response.WriteAsJsonAsync(problem, _jsonOptions, "application/problem+json", cancellationToken);
        return true;
    }
}
