using Acme.Documents.DTO.Documents;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;

namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Upload;

public interface IUploadDocumentCommandHandler
{
    Task<DocumentResponseDto> ExecuteAsync(UserContext userContext, DocumentUploadRequestDto request, CancellationToken cancellationToken);
}
