using System.Text.Json;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Delete;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Upload;
using Acme.Documents.DTO.Documents;
using Acme.ServiceDefaults.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Documents.Service.Controllers.Documents;

/// <summary>Changes to documents. Reads are in <see cref="DocumentController"/>.</summary>
public sealed class DocumentCommandController : ApiControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IUploadDocumentCommandHandler _uploadDocumentCommandHandler;
    private readonly IDeleteDocumentCommandHandler _deleteDocumentCommandHandler;

    public DocumentCommandController(
        IUploadDocumentCommandHandler uploadDocumentCommandHandler,
        IDeleteDocumentCommandHandler deleteDocumentCommandHandler)
    {
        _uploadDocumentCommandHandler = uploadDocumentCommandHandler;
        _deleteDocumentCommandHandler = deleteDocumentCommandHandler;
    }

    /// <summary>
    /// Multipart upload. <c>variants</c> is optional JSON, e.g. <c>[{"name":"display","maxDimension":1200,"quality":82}]</c>.
    /// Returns 202: variants are produced in the background; poll the document or listen for document.processed.v1.
    /// </summary>
    [HttpPost("v1/documents")]
    [RequirePermission("documents.write")]
    [RequestSizeLimit(25 * 1024 * 1024)]
    [ProducesResponseType<DocumentResponseDto>(StatusCodes.Status202Accepted)]
    public async Task<ActionResult<DocumentResponseDto>> UploadAsync(
        IFormFile file,
        [FromForm] string ownerType,
        [FromForm] Guid ownerId,
        [FromForm] string? variants,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(file);

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, cancellationToken).ConfigureAwait(false);
        var variantSpecs = string.IsNullOrWhiteSpace(variants) ? [] : JsonSerializer.Deserialize<List<VariantSpecDto>>(variants, JsonOptions) ?? [];
        var request = new DocumentUploadRequestDto(ownerType, ownerId, file.FileName, file.ContentType, buffer.ToArray(), variantSpecs);

        var response = await _uploadDocumentCommandHandler.ExecuteAsync(CurrentUser, request, cancellationToken).ConfigureAwait(false);
        return Accepted($"/v1/documents/{response.Id}", response);
    }

    /// <summary>Deletes a document with all its content. Used to undo an upload whose owning record was not saved.</summary>
    [HttpDelete("v1/documents/{documentId:guid}")]
    [RequirePermission("documents.write")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<ActionResult> DeleteAsync(Guid documentId, CancellationToken cancellationToken)
    {
        await _deleteDocumentCommandHandler.ExecuteAsync(CurrentUser, documentId, cancellationToken).ConfigureAwait(false);
        return NoContent();
    }
}
