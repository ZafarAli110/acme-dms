namespace Acme.Documents.Persistence.Entities;

/// <summary>The bytes of a document: the "original" as uploaded, or a processed variant. Stored in Postgres (bytea).</summary>
public sealed class DocumentContent
{
    public const string Original = "original";

    public Guid DocumentId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public byte[] Data { get; set; } = [];

    public int? Width { get; set; }

    public int? Height { get; set; }

    public long SizeBytes { get; set; }
}
