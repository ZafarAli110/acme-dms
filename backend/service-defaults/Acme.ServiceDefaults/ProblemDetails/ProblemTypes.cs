namespace Acme.ServiceDefaults.ProblemDetails;

/// <summary>Stable, machine-readable error identifiers used as the problem details <c>type</c>. Same catalogue as dealership-api.</summary>
public static class ProblemTypes
{
    public static string ForStatus(int status) => status switch
    {
        StatusCodes.Status400BadRequest => "urn:acme:error:validation",
        StatusCodes.Status401Unauthorized => "urn:acme:error:unauthorized",
        StatusCodes.Status403Forbidden => "urn:acme:error:forbidden",
        StatusCodes.Status404NotFound => "urn:acme:error:not-found",
        StatusCodes.Status409Conflict => "urn:acme:error:conflict",
        StatusCodes.Status429TooManyRequests => "urn:acme:error:too-many-requests",
        StatusCodes.Status503ServiceUnavailable => "urn:acme:error:service-unavailable",
        _ => "urn:acme:error:internal",
    };
}
