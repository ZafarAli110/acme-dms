using System.Diagnostics.CodeAnalysis;
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

    /// <summary>
    /// Postgres's row version (<c>xmin</c>), checked on every save: processing, failing and deleting a document each read
    /// it first, so a save that lost a race to another fails instead of writing over it (a deleted document marked
    /// ready, or a delete writing back the status it read).
    /// </summary>
    public uint Version { get; set; }

    public ICollection<DocumentContent> Contents { get; } = [];

    /// <summary>
    /// Whether processing may still move it: Pending and not deleted. Ready and Failed are final, and a deleted document is
    /// never processed (the state sweep's F13: the moves, in one place; the database's checks hold the values).
    /// </summary>
    public bool CanBeProcessed => Status == DocumentStatus.Pending && !IsDeleted;

    /// <summary>Pending → Ready: its variants are made. Throws on any other move.</summary>
    public void MarkReady(DateTimeOffset at)
    {
        EnsureCanBeProcessed();
        Status = DocumentStatus.Ready;
        ProcessedAt = at;
    }

    /// <summary>Pending → Failed, with why (at most 1,000 characters). Throws on any other move.</summary>
    /// <remarks>Sets <see cref="FailureReason"/>: the compiler knows it is not null after this.</remarks>
    [MemberNotNull(nameof(FailureReason))]
    public void MarkFailed(string reason, DateTimeOffset at)
    {
        ArgumentNullException.ThrowIfNull(reason);
        EnsureCanBeProcessed();
        Status = DocumentStatus.Failed;
        FailureReason = reason.Length > 1000 ? reason[..1000] : reason;
        ProcessedAt = at;
    }

    private void EnsureCanBeProcessed()
    {
        if (!CanBeProcessed)
        {
            throw new InvalidOperationException($"Document {Id} is {Status}{(IsDeleted ? ", deleted" : "")}: it cannot be processed.");
        }
    }
}
