namespace Acme.Documents.DTO.Documents;

public sealed record DocumentUploadRequestDto(
    string OwnerType,
    Guid OwnerId,
    string FileName,
    string ContentType,
    ReadOnlyMemory<byte> Content,
    IReadOnlyList<VariantSpecDto> Variants);
