using Acme.Documents.Persistence.Database;
namespace Acme.Documents.Persistence.Transactions;

internal sealed class UnitOfWork : IUnitOfWork
{
    private readonly DocumentsDbContext _dbContext;

    public UnitOfWork(DocumentsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken) => _dbContext.SaveChangesAsync(cancellationToken);
}
