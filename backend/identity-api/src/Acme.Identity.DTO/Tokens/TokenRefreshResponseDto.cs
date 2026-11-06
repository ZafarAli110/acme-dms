namespace Acme.Identity.DTO.Tokens;

public sealed record TokenRefreshResponseDto(string AccessToken, string TokenType, int ExpiresIn);
