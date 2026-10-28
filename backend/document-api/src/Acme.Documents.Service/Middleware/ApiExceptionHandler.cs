using System.Text.Json;
using Acme.ServiceDefaults.ProblemDetails;
using Microsoft.AspNetCore.Diagnostics;
using Acme.Documents.BusinessLogic.Abstractions.Exceptions;

namespace Acme.Documents.Service.Middleware;

/// <summary>
/// Turns an <see cref="ApiException"/> from a business handler into the Acme problem details contract, so controllers
/// only call the handler and return its result. Any other exception is left alone and becomes a 500.
/// </summary>
public sealed class ApiExceptionHandler : IExceptionHandler
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        if (exception is not ApiException apiException)
        {
            return false;
        }

        var status = (int)apiException.Category;
        httpContext.Response.StatusCode = status;
        var problem = ProblemDetailsDtoFactory.Create(httpContext, status, apiException.Message);
        await httpContext.Response.WriteAsJsonAsync(problem, JsonOptions, "application/problem+json", cancellationToken).ConfigureAwait(false);
        return true;
    }
}
