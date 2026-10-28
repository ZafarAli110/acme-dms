using Acme.Documents.Persistence.Auditing;

namespace Acme.Documents.Persistence.Entities;

public sealed class Document : AuditedEntity
{
    public Guid Id { get; set; }

    /// <summary>The tenant. Every query is filtered by it automatically (see DocumentsDbContext).</summary>
    public Guid DealerId { get; set; }

    public string OwnerType { get; set; } = string.Empty;

    public Guid OwnerId { get; set; }

    public string OriginalFileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    public DocumentStatus Status { get; set; }

    public string? FailureReason { get; set; }

    /// <summary>The variants the uploader asked for, as JSON (name, max dimension, quality).</summary>
    public string RequestedVariants { get; set; } = "[]";

    public DateTimeOffset? ProcessedAt { get; set; }

    public ICollection<DocumentContent> Contents { get; } = [];
}
