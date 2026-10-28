using Acme.Documents.DTO.Messages;

namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Process;

/// <summary>Produces a document's variants and publishes document.processed. Called by the RabbitMQ consumer.</summary>
public interface IProcessDocumentCommandHandler
{
    Task ExecuteAsync(ProcessDocumentMessageDto message, CancellationToken cancellationToken);
}
