using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Transactions;

namespace Acme.Documents.Tests;

internal sealed class TestUnitOfWork : IUnitOfWork
{
    private readonly DocumentsDbContext _dbContext;

    public TestUnitOfWork(DocumentsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken) => _dbContext.SaveChangesAsync(cancellationToken);

    // The in-memory database has no transactions; the work runs as it is.
    public Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(work);
        return work(cancellationToken);
    }
}
