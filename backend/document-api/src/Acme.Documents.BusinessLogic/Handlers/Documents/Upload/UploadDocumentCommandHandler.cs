using System.Text.Json;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Upload;
using Acme.Documents.DTO.Documents;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Entities;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;
using Acme.Documents.BusinessLogic.Abstractions.Exceptions;
using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Messaging;
using Acme.Documents.Persistence.Transactions;

namespace Acme.Documents.BusinessLogic.Handlers.Documents.Upload;

/// <summary>
/// Stores the original, records the requested variants and queues the processing work, all in one transaction.
/// Feature rules (which file types, how many per owner) belong to the calling service; this enforces only what
/// document-api itself must: a size limit and that variants are only requested for images.
/// </summary>
internal sealed class UploadDocumentCommandHandler : IUploadDocumentCommandHandler
{
    internal const long MaxBytes = 20 * 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly DocumentsDbContext _dbContext;
    private readonly IOutbox _outbox;
    private readonly IUnitOfWork _unitOfWork;

    public UploadDocumentCommandHandler(DocumentsDbContext dbContext, IOutbox outbox, IUnitOfWork unitOfWork)
    {
        _dbContext = dbContext;
        _outbox = outbox;
        _unitOfWork = unitOfWork;
    }

    public async Task<DocumentResponseDto> ExecuteAsync(UserContext userContext, DocumentUploadRequestDto request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(userContext);
        ArgumentNullException.ThrowIfNull(request);
        Validate(request);

        var document = new Document
        {
            DealerId = userContext.DealerId,
            OwnerType = request.OwnerType,
            OwnerId = request.OwnerId,
            OriginalFileName = request.FileName,
            ContentType = request.ContentType,
            SizeBytes = request.Content.Length,
            Status = request.Variants.Count == 0 ? DocumentStatus.Ready : DocumentStatus.Pending,
            RequestedVariants = JsonSerializer.Serialize(request.Variants, JsonOptions),
        };
        // The content's DocumentId is filled in from the document when it is saved.
        document.Contents.Add(new DocumentContent
        {
            Name = DocumentContent.Original,
            ContentType = request.ContentType,
            Data = request.Content.ToArray(),
            SizeBytes = request.Content.Length,
        });

        return await _unitOfWork.ExecuteInTransactionAsync(
            async token =>
            {
                _dbContext.Documents.Add(document);
                // The database assigns the document's id (uuidv7()); the processing message needs it, so it is queued
                // after this save, in the same transaction.
                await _unitOfWork.SaveChangesAsync(token);
                if (document.Status == DocumentStatus.Pending)
                {
                    _outbox.Add(MessageTypes.ProcessDocument, new ProcessDocumentMessageDto(document.Id, document.DealerId));
                    await _unitOfWork.SaveChangesAsync(token);
                }

                return DocumentMapper.ToDocumentResponseDto(document);
            },
            cancellationToken);
    }

    private static void Validate(DocumentUploadRequestDto request)
    {
        if (request.Content.Length == 0)
        {
            throw new ApiException(ApiErrorCategory.BadRequest, "The file is empty.");
        }

        if (request.Content.Length > MaxBytes)
        {
            throw new ApiException(ApiErrorCategory.BadRequest, $"File too large. Maximum size: {MaxBytes / 1024 / 1024} MB.");
        }

        if (request.Variants.Count > 0 && !request.ContentType.StartsWith("image/", StringComparison.Ordinal))
        {
            throw new ApiException(ApiErrorCategory.BadRequest, $"Variants can only be produced for images, not {request.ContentType}.");
        }

        if (request.Variants.Any(v => v.Name == DocumentContent.Original || v.MaxDimension is < 16 or > 4096 || v.Quality is < 1 or > 100))
        {
            throw new ApiException(ApiErrorCategory.BadRequest, "Each variant needs a name other than 'original', a max dimension of 16-4096 and a quality of 1-100.");
        }
    }
}
