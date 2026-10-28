namespace Acme.Documents.DTO.Documents;

/// <summary>A processed rendition of a document, e.g. the 1200 px WebP "display" version of a photo.</summary>
public sealed record DocumentVariantDto(string Name, string ContentType, int? Width, int? Height, long SizeBytes);
