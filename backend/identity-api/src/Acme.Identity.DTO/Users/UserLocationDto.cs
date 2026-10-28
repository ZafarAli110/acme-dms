namespace Acme.Identity.DTO.Users;

/// <summary>A location the user works at, with their role there and the permissions that role grants.</summary>
public sealed record UserLocationDto(Guid Id, string Code, string Name, string Role, IReadOnlyList<string> Permissions);
