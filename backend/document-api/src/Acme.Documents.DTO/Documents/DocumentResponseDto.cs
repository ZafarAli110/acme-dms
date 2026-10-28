namespace Acme.Documents.DTO.Documents;

public sealed record DocumentResponseDto(
    Guid Id,
    string OwnerType,
    Guid OwnerId,
    string OriginalFileName,
    string ContentType,
    long SizeBytes,
    string Status,
    string? FailureReason,
    IReadOnlyList<DocumentVariantDto> Variants,
    DateTimeOffset CreatedAt);
