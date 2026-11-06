namespace Acme.Identity.DTO.Sessions;

/// <summary>
/// The sign-ins that ended lately, for the services to refuse the access tokens of: their ids (the tokens' <c>sid</c>),
/// and the service's own clock, which is where the next question starts.
/// </summary>
public sealed record RevokedSessionsResponseDto(DateTimeOffset Now, IReadOnlyList<Guid> Revoked);
