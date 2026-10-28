using Acme.Documents.DTO.Documents;

namespace Acme.Documents.DTO.Messages;

public sealed record DocumentProcessedMessageDto(Guid DocumentId, Guid DealerId, string OwnerType, Guid OwnerId, IReadOnlyList<DocumentVariantDto> Variants);
