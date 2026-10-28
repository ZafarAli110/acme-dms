using System.Diagnostics;
using System.Globalization;
using Microsoft.AspNetCore.WebUtilities;

namespace Acme.ServiceDefaults.ProblemDetails;

public static class ProblemDetailsDtoFactory
{
    private const string UnexpectedErrorDetail = "An unexpected error occurred";

    public static ProblemDetailsDto Create(HttpContext httpContext, int status, string? detail)
    {
        // Server errors never leak internals to the client; the full error is in the log and the trace.
        var safeDetail = status >= StatusCodes.Status500InternalServerError ? UnexpectedErrorDetail : detail;
        return CreateWithSafeDetail(httpContext, status, safeDetail);
    }

    /// <summary>
    /// For a detail written for the client, never taken from an exception (a fixed message such as "The database is
    /// busy or unavailable"): shown as given, even on a 5xx.
    /// </summary>
    public static ProblemDetailsDto CreateWithSafeDetail(HttpContext httpContext, int status, string? detail)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        return new ProblemDetailsDto(
            Type: ProblemTypes.ForStatus(status),
            Title: ReasonPhrases.GetReasonPhrase(status),
            Status: status,
            Detail: detail,
            Instance: httpContext.Request.Path.HasValue ? httpContext.Request.Path.Value : null,
            Location: httpContext.Request.Headers["x-location-id"].FirstOrDefault(),
            UserId: httpContext.User.FindFirst("sub")?.Value,
            TraceId: Activity.Current?.TraceId.ToString(),
            Timestamp: DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture));
    }
}
