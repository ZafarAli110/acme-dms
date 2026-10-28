using Acme.Documents.DTO.Documents;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;

namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.GetContent;

public interface IGetDocumentContentQueryHandler
{
    /// <summary>The bytes of the original ("original") or of a processed variant (e.g. "display").</summary>
    Task<DocumentContentDto> ExecuteAsync(UserContext userContext, Guid documentId, string name, CancellationToken cancellationToken);
}
