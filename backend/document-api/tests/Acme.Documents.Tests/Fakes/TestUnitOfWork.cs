using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Transactions;

namespace Acme.Documents.Tests;

internal sealed class TestUnitOfWork : IUnitOfWork
{
    private readonly DocumentsDbContext _dbContext;
    private Func<Task>? _beforeFirstSave;

    /// <param name="beforeFirstSave">Runs once, just before the first save: what another request does in between.</param>
    public TestUnitOfWork(DocumentsDbContext dbContext, Func<Task>? beforeFirstSave = null)
    {
        _dbContext = dbContext;
        _beforeFirstSave = beforeFirstSave;
    }

    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken)
    {
        if (_beforeFirstSave is { } beforeFirstSave)
        {
            _beforeFirstSave = null;
            await beforeFirstSave();
        }

        return await _dbContext.SaveChangesAsync(cancellationToken);
    }

    // The in-memory database has no transactions; the work runs as it is.
    public Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(work);
        return work(cancellationToken);
    }
}
