namespace Acme.Identity.DTO.Users;

/// <summary>A user of the dealer as a manager sees them: their job and the locations they work at.</summary>
public sealed record DealerUserResponseDto(Guid Id, string Email, string DisplayName, string Role, IReadOnlyList<Guid> LocationIds);
