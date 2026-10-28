using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Delete;
using Microsoft.EntityFrameworkCore;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;
using Acme.Documents.BusinessLogic.Abstractions.Exceptions;
using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Transactions;

namespace Acme.Documents.BusinessLogic.Handlers.Documents.Delete;

/// <summary>
/// Deletes a document with its original and variants. A feature calls this to undo an upload when the record the file
/// belongs to could not be saved (see docs/standards/file-uploads.md). A processing message still queued for the
/// document finds nothing and does nothing.
/// </summary>
internal sealed class DeleteDocumentCommandHandler : IDeleteDocumentCommandHandler
{
    private readonly DocumentsDbContext _dbContext;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteDocumentCommandHandler(DocumentsDbContext dbContext, IUnitOfWork unitOfWork)
    {
        _dbContext = dbContext;
        _unitOfWork = unitOfWork;
    }

    public async Task ExecuteAsync(UserContext userContext, Guid documentId, CancellationToken cancellationToken)
    {
        // The dealer filter on DocumentsDbContext already limits this to the user's dealer.
        var document = await _dbContext.Documents
            .Include(d => d.Contents)
            .SingleOrDefaultAsync(d => d.Id == documentId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new ApiException(ApiErrorCategory.NotFound, $"Document {documentId} was not found.");

        _dbContext.Documents.Remove(document);
        await _unitOfWork.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
