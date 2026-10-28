using Acme.Documents.DTO.Documents;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;

namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Get;

public interface IGetDocumentQueryHandler
{
    Task<DocumentResponseDto> ExecuteAsync(UserContext userContext, Guid documentId, CancellationToken cancellationToken);
}
