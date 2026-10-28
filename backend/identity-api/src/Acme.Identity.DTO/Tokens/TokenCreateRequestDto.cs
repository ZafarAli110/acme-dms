using System.ComponentModel.DataAnnotations;

namespace Acme.Identity.DTO.Tokens;

public sealed record TokenCreateRequestDto(
    [Required, EmailAddress] string Email,
    [Required] string Password);
