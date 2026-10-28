using Acme.Documents.BusinessLogic.Abstractions.Authorization;
namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Delete;

public interface IDeleteDocumentCommandHandler
{
    Task ExecuteAsync(UserContext userContext, Guid documentId, CancellationToken cancellationToken);
}
