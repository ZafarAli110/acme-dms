namespace Acme.Documents.DTO.Messages;

/// <summary>Message types are also the RabbitMQ routing keys on the <see cref="Exchange"/> exchange.</summary>
public static class MessageTypes
{
    public const string Exchange = "acme.documents";
    public const string ProcessDocument = "document.process.v1";
    public const string DocumentProcessed = "document.processed.v1";
    public const string DocumentFailed = "document.failed.v1";

    /// <summary>dealership-api → document-api: no record claimed this document; it is deleted. Data: ProcessDocumentMessageDto's shape.</summary>
    public const string DocumentUnclaimed = "document.unclaimed.v1";
}
