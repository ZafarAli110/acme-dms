using Acme.Documents.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Documents.Persistence.Transactions;

internal sealed class UnitOfWork : IUnitOfWork
{
    private readonly DocumentsDbContext _dbContext;

    public UnitOfWork(DocumentsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken) => _dbContext.SaveChangesAsync(cancellationToken);

    public async Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(work);

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var result = await work(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }
}
