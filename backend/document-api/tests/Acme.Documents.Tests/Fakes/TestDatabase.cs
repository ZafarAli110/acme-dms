using Acme.Documents.Persistence.Auditing;
using Acme.Documents.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Documents.Tests;

/// <summary>
/// An in-memory documents database shared by several contexts, each with its own dealer scope. Saves go through the
/// real auditing interceptor, as <see cref="ActorId"/> at <see cref="Now"/>.
/// </summary>
internal sealed class TestDatabase
{
    public static readonly Guid ActorId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    public static readonly DateTimeOffset Now = new(2026, 11, 3, 9, 0, 0, TimeSpan.Zero);

    private readonly DbContextOptions<DocumentsDbContext> _options =
        new DbContextOptionsBuilder<DocumentsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .AddInterceptors(new AuditingInterceptor(new FixedActor(), new FixedTimeProvider()))
            .Options;

    public DocumentsDbContext CreateContext(Guid? dealerId) => new(_options, new TestDealerScope(dealerId));

    private sealed class FixedActor : ICurrentActor
    {
        public Guid UserId => ActorId;
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
