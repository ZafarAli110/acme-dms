using System.ComponentModel.DataAnnotations;

namespace Acme.Identity.DTO.Tokens;

public sealed record TokenRefreshRequestDto([Required] string RefreshToken);
