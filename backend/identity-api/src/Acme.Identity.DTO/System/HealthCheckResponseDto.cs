namespace Acme.Identity.DTO.System;

/// <summary>Whether the service is up, which version is running ("26.11.0") and whether it reaches its database.</summary>
public sealed record HealthCheckResponseDto(string Status, string Version, bool DatabaseReachable);
