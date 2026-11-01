using Acme.Identity.Persistence.Auditing;

namespace Acme.Identity.Persistence.Entities;

public sealed class User : AuditedEntity
{
    public Guid Id { get; set; }

    public Guid DealerId { get; set; }

    public string Email { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>
    /// Where the user starts after signing in: always one of their own locations. Null only for a user with no
    /// location, who cannot sign in to anything.
    /// </summary>
    public Guid? DefaultLocationId { get; set; }

    public Dealer? Dealer { get; set; }

    public ICollection<UserLocationRole> LocationRoles { get; } = [];
}
