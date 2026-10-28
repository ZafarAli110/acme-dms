using Acme.Documents.DTO.Messages;

namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Fail;

/// <summary>Marks a document as failed and publishes document.failed. Called once processing has run out of retries.</summary>
public interface IFailDocumentCommandHandler
{
    Task ExecuteAsync(ProcessDocumentMessageDto message, string reason, CancellationToken cancellationToken);
}
