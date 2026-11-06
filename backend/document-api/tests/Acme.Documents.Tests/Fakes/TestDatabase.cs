using Acme.Documents.Persistence.Auditing;
using Acme.Documents.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Documents.Tests;

/// <summary>
/// A real documents database of its own (<see cref="TestPostgres"/>), shared by several contexts, each with its own
/// dealer scope. Saves go through the real auditing interceptor, as <see cref="ActorId"/> at <see cref="Now"/>.
/// </summary>
internal sealed class TestDatabase
{
    public static readonly Guid ActorId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    public static readonly DateTimeOffset Now = new(2026, 11, 3, 9, 0, 0, TimeSpan.Zero);

    private readonly DbContextOptions<DocumentsDbContext> _options;

    private TestDatabase(string connectionString)
    {
        _options = new DbContextOptionsBuilder<DocumentsDbContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(new AuditingInterceptor(new FixedActor(), new FixedTimeProvider()))
            .Options;
    }

    public static async Task<TestDatabase> CreateAsync(CancellationToken cancellationToken) =>
        new(await TestPostgres.NewDatabaseAsync(cancellationToken));

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
