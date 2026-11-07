namespace Acme.Gateway.DTO.Sessions;

/// <summary>What the sign-in form sends to <c>POST /api/session</c>.</summary>
public sealed record SessionCreateRequestDto(string Email, string Password);
