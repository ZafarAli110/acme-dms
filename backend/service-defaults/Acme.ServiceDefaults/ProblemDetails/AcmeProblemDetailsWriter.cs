using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace Acme.ServiceDefaults.ProblemDetails;

/// <summary>
/// Writes every framework-generated problem (unmatched routes, unhandled exceptions) as <see cref="ProblemDetailsDto"/>,
/// so every .NET service returns exactly the same error contract as dealership-api.
/// </summary>
internal sealed class AcmeProblemDetailsWriter : IProblemDetailsWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public bool CanWrite(ProblemDetailsContext context) => true;

    public ValueTask WriteAsync(ProblemDetailsContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var httpContext = context.HttpContext;
        var status = context.ProblemDetails.Status ?? httpContext.Response.StatusCode;
        var problem = ProblemDetailsDtoFactory.Create(httpContext, status, context.ProblemDetails.Detail);

        httpContext.Response.StatusCode = status;
        return new ValueTask(httpContext.Response.WriteAsJsonAsync(problem, JsonOptions, "application/problem+json"));
    }
}
