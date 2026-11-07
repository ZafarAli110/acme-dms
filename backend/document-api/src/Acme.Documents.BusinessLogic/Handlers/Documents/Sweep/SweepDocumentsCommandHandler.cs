using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Fail;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Sweep;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Acme.Documents.BusinessLogic.Handlers.Documents.Sweep;

internal sealed class SweepDocumentsCommandHandler : ISweepDocumentsCommandHandler
{
    /// <summary>
    /// How long a document may stay pending. Shorter than dealership-api's 10 minutes for a photo, so a photo normally
    /// gets the real <c>document.failed</c> before its own deadline.
    /// </summary>
    public static readonly TimeSpan PendingDeadline = TimeSpan.FromMinutes(8);

    /// <summary>How long a published outbox message is kept, for looking into what was sent.</summary>
    public static readonly TimeSpan PublishedKeptFor = TimeSpan.FromDays(7);

    public const string TimedOut = "Processing did not finish in time.";

    private const int Batch = 50;

    private readonly DocumentsDbContext _dbContext;
    private readonly IFailDocumentCommandHandler _fail;
    private readonly TimeProvider _timeProvider;

    public SweepDocumentsCommandHandler(DocumentsDbContext dbContext, IFailDocumentCommandHandler fail, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _fail = fail;
        _timeProvider = timeProvider;
    }

    public async Task<int> ExecuteAsync(CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        // Background work: no signed-in user, so the dealer filter is lifted and every dealer's documents are swept.
        var overdue = await _dbContext.Documents
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(d => d.Status == DocumentStatus.Pending && !d.IsDeleted && d.CreatedAt < now - PendingDeadline)
            .OrderBy(d => d.CreatedAt)
            .Select(d => new { d.Id, d.DealerId })
            .Take(Batch)
            .ToListAsync(cancellationToken);

        var failed = 0;
        foreach (var document in overdue)
        {
            try
            {
                // The same Fail as the last retry: guarded by the row version, and its event goes out with it.
                await _fail.ExecuteAsync(new ProcessDocumentMessageDto(document.Id, document.DealerId), TimedOut, cancellationToken);
                failed++;
            }
            catch (DbUpdateConcurrencyException)
            {
                // It finished, failed or was deleted meanwhile (another instance's sweep, or its own message): nothing to do.
                _dbContext.ChangeTracker.Clear();
            }
        }

        await _dbContext.OutboxMessages
            .Where(m => m.PublishedAt != null && m.PublishedAt < now - PublishedKeptFor)
            .ExecuteDeleteAsync(cancellationToken);
        return failed;
    }
}
