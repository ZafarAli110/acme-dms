namespace Acme.Identity.DTO.System;

/// <summary>
/// The same shape from every service (the gateway, identity-api, document-api and dealership-api): which service, whether
/// it is fine ("degraded" when it cannot reach its database, or for identity-api when it cannot open the key that signs), the product version ("26.11.0"), and whether the database
/// answers (null for a service without one).
/// </summary>
public sealed record HealthCheckResponseDto(string Service, string Status, string Version, bool? DatabaseReachable);
