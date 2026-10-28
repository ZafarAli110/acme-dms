namespace Acme.Documents.Persistence.Transactions;

/// <summary>Commits every change tracked in the current request as one transaction.</summary>
public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Runs <paramref name="work"/> in one database transaction, for work that saves more than once: a row's key is
    /// assigned by the database (<c>uuidv7()</c>), so anything that needs the new key (an outbox message) is written by
    /// a second save. Both saves commit together or not at all.
    /// </summary>
    Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken cancellationToken);
}
