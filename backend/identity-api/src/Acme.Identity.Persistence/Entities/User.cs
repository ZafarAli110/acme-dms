using Acme.Identity.Persistence.Auditing;

namespace Acme.Identity.Persistence.Entities;

public sealed class User : AuditedEntity
{
    public Guid Id { get; set; }

    public Guid DealerId { get; set; }

    public string Email { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public Dealer? Dealer { get; set; }

    public ICollection<UserLocationRole> LocationRoles { get; } = [];
}
