using Acme.Identity.Persistence.Auditing;

namespace Acme.Identity.Persistence.Entities;

/// <summary>The role a user holds at one location. A user can work at several locations with different roles.</summary>
public sealed class UserLocationRole : AuditedEntity
{
    public Guid UserId { get; set; }

    public Guid LocationId { get; set; }

    public string Role { get; set; } = string.Empty;

    public Location? Location { get; set; }
}
