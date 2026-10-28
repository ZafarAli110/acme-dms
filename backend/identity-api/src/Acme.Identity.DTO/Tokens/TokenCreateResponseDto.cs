namespace Acme.Identity.DTO.Tokens;

public sealed record TokenCreateResponseDto(string AccessToken, string TokenType, int ExpiresIn);
