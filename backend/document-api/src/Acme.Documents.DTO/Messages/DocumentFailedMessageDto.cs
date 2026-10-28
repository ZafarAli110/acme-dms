namespace Acme.Documents.DTO.Messages;

public sealed record DocumentFailedMessageDto(Guid DocumentId, Guid DealerId, string OwnerType, Guid OwnerId, string Reason);
