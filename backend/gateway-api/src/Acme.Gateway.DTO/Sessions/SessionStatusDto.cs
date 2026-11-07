namespace Acme.Gateway.DTO.Sessions;

/// <summary>What <c>GET /api/session</c> answers: whether this browser's session cookie signs someone in.</summary>
public sealed record SessionStatusDto(bool IsSignedIn);
