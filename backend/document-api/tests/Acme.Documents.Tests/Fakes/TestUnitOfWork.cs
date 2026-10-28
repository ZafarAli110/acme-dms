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
}
