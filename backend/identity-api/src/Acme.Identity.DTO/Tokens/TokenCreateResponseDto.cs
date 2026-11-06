namespace Acme.Identity.DTO.Tokens;

/// <summary>
/// A sign-in: the short access token to send with requests. The refresh token that renews it is not here: the service
/// sets it as an httpOnly cookie, out of reach of the page's scripts.
/// </summary>
public sealed record TokenCreateResponseDto(string AccessToken, string TokenType, int ExpiresIn);
