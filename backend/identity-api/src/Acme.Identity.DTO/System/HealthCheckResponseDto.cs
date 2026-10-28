namespace Acme.Identity.DTO.System;

public sealed record HealthCheckResponseDto(string Status, bool DatabaseReachable);
