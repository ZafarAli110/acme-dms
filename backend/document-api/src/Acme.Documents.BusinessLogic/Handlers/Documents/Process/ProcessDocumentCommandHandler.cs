using System.Text.Json;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Process;
using Acme.Documents.BusinessLogic.Abstractions.ImageProcessing;
using Acme.Documents.DTO.Documents;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Messaging;
using Acme.Documents.Persistence.Transactions;

namespace Acme.Documents.BusinessLogic.Handlers.Documents.Process;

/// <summary>
/// Produces every requested variant and publishes document.processed, in one transaction. Idempotent: a document
/// that is no longer pending (already processed, or failed) is skipped, so a redelivered message does no harm.
/// </summary>
internal sealed class ProcessDocumentCommandHandler : IProcessDocumentCommandHandler
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly DocumentsDbContext _dbContext;
    private readonly IImageProcessor _imageProcessor;
    private readonly IOutbox _outbox;
    private readonly IUnitOfWork _unitOfWork;
    private readonly TimeProvider _timeProvider;

    public ProcessDocumentCommandHandler(
        DocumentsDbContext dbContext,
        IImageProcessor imageProcessor,
        IOutbox outbox,
        IUnitOfWork unitOfWork,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _imageProcessor = imageProcessor;
        _outbox = outbox;
        _unitOfWork = unitOfWork;
        _timeProvider = timeProvider;
    }

    public async Task ExecuteAsync(ProcessDocumentMessageDto message, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(message);

        // Background work has no signed-in user, so the dealer filter is lifted explicitly and the dealer is matched by hand.
        var document = await _dbContext.Documents
            .IgnoreQueryFilters()
            .Include(d => d.Contents)
            .SingleOrDefaultAsync(d => d.Id == message.DocumentId && d.DealerId == message.DealerId, cancellationToken)
            .ConfigureAwait(false);

        // Background work lifts the query filters, so a deleted document is skipped here explicitly.
        if (document is null || document.IsDeleted || document.Status != DocumentStatus.Pending)
        {
            return;
        }

        var original = document.Contents.Single(c => c.Name == DocumentContent.Original);
        var variants = JsonSerializer.Deserialize<List<VariantSpecDto>>(document.RequestedVariants, JsonOptions) ?? [];
        foreach (var variant in variants)
        {
            var image = _imageProcessor.Process(original.Data, variant);
            document.Contents.Add(new DocumentContent
            {
                DocumentId = document.Id,
                Name = variant.Name,
                ContentType = "image/webp",
                Data = image.Data,
                Width = image.Width,
                Height = image.Height,
                SizeBytes = image.Data.Length,
            });
        }

        document.Status = DocumentStatus.Ready;
        document.ProcessedAt = _timeProvider.GetUtcNow();
        _outbox.Add(
            MessageTypes.DocumentProcessed,
            new DocumentProcessedMessageDto(document.Id, document.DealerId, document.OwnerType, document.OwnerId, DocumentMapper.ToVariantDtos(document.Contents)));

        await _unitOfWork.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
