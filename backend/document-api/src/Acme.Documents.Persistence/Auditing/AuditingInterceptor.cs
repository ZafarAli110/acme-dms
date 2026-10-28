using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Acme.Documents.Persistence.Auditing;

/// <summary>
/// Fills in the audit columns of every <see cref="AuditedEntity"/> being saved, and turns a delete into a soft delete:
/// the row stays, marked deleted with who and when, and the query filters leave it out from then on.
/// </summary>
public sealed class AuditingInterceptor : SaveChangesInterceptor
{
    private readonly ICurrentActor _currentActor;
    private readonly TimeProvider _timeProvider;

    public AuditingInterceptor(ICurrentActor currentActor, TimeProvider timeProvider)
    {
        _currentActor = currentActor;
        _timeProvider = timeProvider;
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Stamp(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Stamp(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void Stamp(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var now = _timeProvider.GetUtcNow();
        var actor = _currentActor.UserId;
        foreach (var entry in context.ChangeTracker.Entries<AuditedEntity>().ToList())
        {
            var entity = entry.Entity;
            switch (entry.State)
            {
                case EntityState.Added:
                    entity.CreatedAt = now;
                    entity.CreatedBy = actor;
                    entity.UpdatedAt = now;
                    entity.UpdatedBy = actor;
                    break;
                case EntityState.Modified:
                    entity.UpdatedAt = now;
                    entity.UpdatedBy = actor;
                    break;
                case EntityState.Deleted:
                    entry.State = EntityState.Modified;
                    entity.IsDeleted = true;
                    entity.DeletedAt = now;
                    entity.DeletedBy = actor;
                    entity.UpdatedAt = now;
                    entity.UpdatedBy = actor;
                    break;
                default:
                    break;
            }
        }
    }
}
