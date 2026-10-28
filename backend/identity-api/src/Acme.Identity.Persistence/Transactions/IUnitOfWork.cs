namespace Acme.Identity.Persistence.Transactions;

/// <summary>Commits every change tracked in the current request as one transaction.</summary>
public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
