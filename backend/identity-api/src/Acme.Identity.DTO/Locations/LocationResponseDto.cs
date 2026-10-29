namespace Acme.Identity.DTO.Locations;

/// <summary>One of the dealer's locations (rooftops).</summary>
public sealed record LocationResponseDto(Guid Id, string Code, string Name);
