using Acme.Identity.Persistence.Auditing;

namespace Acme.Identity.Persistence.Entities;

/// <summary>A physical dealership site (a "rooftop") belonging to a dealer.</summary>
public sealed class Location : AuditedEntity
{
    public Guid Id { get; set; }

    public Guid DealerId { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public Dealer? Dealer { get; set; }
}
