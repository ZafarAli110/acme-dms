namespace Acme.ServiceDefaults.ProblemDetails;

/// <summary>
/// RFC 9457 problem details, extended with the fields Acme services use to trace a failure. Same contract as dealership-api:
/// every field is always present, and is <c>null</c> when there is no value.
/// </summary>
public sealed record ProblemDetailsDto(
    string Type,
    string Title,
    int Status,
    string? Detail,
    string? Instance,
    string? Location,
    string? UserId,
    string? TraceId,
    string Timestamp);
