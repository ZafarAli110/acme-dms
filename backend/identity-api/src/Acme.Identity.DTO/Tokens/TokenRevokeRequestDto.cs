using System.ComponentModel.DataAnnotations;

namespace Acme.Identity.DTO.Tokens;

public sealed record TokenRevokeRequestDto([Required] string RefreshToken);
