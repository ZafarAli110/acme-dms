namespace Acme.Documents.DTO.Messages;

/// <summary>document-api's own work item: process the variants of one uploaded document.</summary>
public sealed record ProcessDocumentMessageDto(Guid DocumentId, Guid DealerId);
