namespace Acme.Identity.DTO.Users;

public sealed record CurrentUserResponseDto(
    Guid Id,
    string Email,
    string DisplayName,
    Guid DealerId,
    string DealerName,
    IReadOnlyList<UserLocationDto> Locations);
