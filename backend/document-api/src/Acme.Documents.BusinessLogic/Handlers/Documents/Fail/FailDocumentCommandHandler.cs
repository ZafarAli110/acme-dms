using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Fail;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Messaging;
using Acme.Documents.Persistence.Transactions;

namespace Acme.Documents.BusinessLogic.Handlers.Documents.Fail;

internal sealed class FailDocumentCommandHandler : IFailDocumentCommandHandler
{
    private readonly DocumentsDbContext _dbContext;
    private readonly IOutbox _outbox;
    private readonly IUnitOfWork _unitOfWork;
    private readonly TimeProvider _timeProvider;

    public FailDocumentCommandHandler(DocumentsDbContext dbContext, IOutbox outbox, IUnitOfWork unitOfWork, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _outbox = outbox;
        _unitOfWork = unitOfWork;
        _timeProvider = timeProvider;
    }

    public async Task ExecuteAsync(ProcessDocumentMessageDto message, string reason, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(message);

        var document = await _dbContext.Documents
            .IgnoreQueryFilters()
            .SingleOrDefaultAsync(d => d.Id == message.DocumentId && d.DealerId == message.DealerId, cancellationToken);

        // Background work lifts the query filters, so a deleted document is skipped here explicitly.
        if (document is null || document.IsDeleted || document.Status != DocumentStatus.Pending)
        {
            return;
        }

        document.Status = DocumentStatus.Failed;
        document.FailureReason = reason.Length > 1000 ? reason[..1000] : reason;
        document.ProcessedAt = _timeProvider.GetUtcNow();
        _outbox.Add(
            MessageTypes.DocumentFailed,
            new DocumentFailedMessageDto(document.Id, document.DealerId, document.OwnerType, document.OwnerId, document.FailureReason));

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
