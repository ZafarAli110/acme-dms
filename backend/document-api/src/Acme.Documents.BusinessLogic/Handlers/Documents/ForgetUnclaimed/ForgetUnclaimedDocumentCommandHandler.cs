using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.ForgetUnclaimed;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Transactions;
using Microsoft.EntityFrameworkCore;

namespace Acme.Documents.BusinessLogic.Handlers.Documents.ForgetUnclaimed;

internal sealed class ForgetUnclaimedDocumentCommandHandler : IForgetUnclaimedDocumentCommandHandler
{
    private const int MaxAttempts = 3;

    private readonly DocumentsDbContext _dbContext;
    private readonly IUnitOfWork _unitOfWork;

    public ForgetUnclaimedDocumentCommandHandler(DocumentsDbContext dbContext, IUnitOfWork unitOfWork)
    {
        _dbContext = dbContext;
        _unitOfWork = unitOfWork;
    }

    public async Task ExecuteAsync(ProcessDocumentMessageDto message, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(message);
        for (var attempt = 1; ; attempt++)
        {
            // Background work: no signed-in user, so the dealer filter is lifted and the dealer is matched by hand.
            var document = await _dbContext.Documents
                .IgnoreQueryFilters()
                .Include(d => d.Contents)
                .SingleOrDefaultAsync(d => d.Id == message.DocumentId && d.DealerId == message.DealerId, cancellationToken);
            if (document is null || document.IsDeleted)
            {
                return;
            }

            _dbContext.Documents.Remove(document);
            try
            {
                await _unitOfWork.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxAttempts)
            {
                // Processing finished it meanwhile: read it again and delete it as it is now.
                _dbContext.ChangeTracker.Clear();
            }
        }
    }
}
