namespace Acme.Documents.DTO.Documents;

/// <summary>A variant the caller wants produced. The caller decides sizes; document-api only processes them.</summary>
public sealed record VariantSpecDto(string Name, int MaxDimension, int Quality);
