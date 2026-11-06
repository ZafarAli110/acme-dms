namespace Acme.Identity.DTO.Tokens;

/// <summary>A sign-in: the short access token to send with requests, and the refresh token that gets a new one.</summary>
public sealed record TokenCreateResponseDto(string AccessToken, string TokenType, int ExpiresIn, string RefreshToken);
