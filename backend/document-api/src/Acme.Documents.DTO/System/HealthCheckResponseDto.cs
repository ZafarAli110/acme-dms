namespace Acme.Documents.DTO.System;

public sealed record HealthCheckResponseDto(string Status, bool DatabaseReachable);
