using Acme.Identity.Persistence.Auditing;

namespace Acme.Identity.Persistence.Entities;

/// <summary>A dealer group: the tenant. Every other row belongs to exactly one dealer.</summary>
public sealed class Dealer : AuditedEntity
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public ICollection<Location> Locations { get; } = [];
}
