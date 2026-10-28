namespace Acme.Documents.Persistence.Auditing;

/// <summary>
/// The columns every business table has (docs/standards/database.md): who created and last changed the row and when,
/// and a soft delete. <see cref="AuditingInterceptor"/> fills them in on every save; code never sets them itself.
/// </summary>
public abstract class AuditedEntity
{
    public DateTimeOffset CreatedAt { get; set; }

    public Guid CreatedBy { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Guid UpdatedBy { get; set; }

    public bool IsDeleted { get; set; }

    public DateTimeOffset? DeletedAt { get; set; }

    public Guid? DeletedBy { get; set; }
}
