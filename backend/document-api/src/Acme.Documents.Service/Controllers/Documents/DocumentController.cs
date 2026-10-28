using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Get;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.GetContent;
using Acme.Documents.DTO.Documents;
using Acme.ServiceDefaults.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Documents.Service.Controllers.Documents;

/// <summary>Reads of documents. Writes are in <see cref="DocumentCommandController"/>.</summary>
public sealed class DocumentController : ApiControllerBase
{
    private readonly IGetDocumentQueryHandler _getDocumentQueryHandler;
    private readonly IGetDocumentContentQueryHandler _getDocumentContentQueryHandler;

    public DocumentController(IGetDocumentQueryHandler getDocumentQueryHandler, IGetDocumentContentQueryHandler getDocumentContentQueryHandler)
    {
        _getDocumentQueryHandler = getDocumentQueryHandler;
        _getDocumentContentQueryHandler = getDocumentContentQueryHandler;
    }

    [HttpGet("v1/documents/{documentId:guid}")]
    [RequirePermission("documents.read")]
    public async Task<ActionResult<DocumentResponseDto>> GetAsync(Guid documentId, CancellationToken cancellationToken) =>
        await _getDocumentQueryHandler.ExecuteAsync(CurrentUser, documentId, cancellationToken).ConfigureAwait(false);

    /// <summary>The bytes of the original ("original") or a processed variant (e.g. "display").</summary>
    [HttpGet("v1/documents/{documentId:guid}/content/{name}")]
    [RequirePermission("documents.read")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ResponseCache(Duration = 86400, Location = ResponseCacheLocation.Client)]
    public async Task<ActionResult> GetContentAsync(Guid documentId, string name, CancellationToken cancellationToken)
    {
        var content = await _getDocumentContentQueryHandler.ExecuteAsync(CurrentUser, documentId, name, cancellationToken).ConfigureAwait(false);
        return File(content.Data.ToArray(), content.ContentType);
    }
}
