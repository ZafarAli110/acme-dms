using Acme.Identity.Persistence.Auditing;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Testcontainers.PostgreSql;

namespace Acme.Identity.Tests.Support;

/// <summary>
/// One real Postgres for the whole test run (Testcontainers, the image the app runs on), with the service's own
/// migrations applied once to a template database; every test gets a fresh copy of it. Real SQL, real constraints:
/// what EF's in-memory provider never checks.
/// </summary>
[TestClass]
public static class TestPostgres
{
    private const string Image = "postgres:18.3";
    private const string Template = "identity_template";

    private static PostgreSqlContainer? _container;

    private static PostgreSqlContainer Container =>
        _container ?? throw new InvalidOperationException("Postgres starts in AssemblyInitialize; is Docker running?");

    [AssemblyInitialize]
    public static async Task StartAsync(TestContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        _container = new PostgreSqlBuilder(Image).Build();
        await _container.StartAsync(context.CancellationToken);
        await ExecuteAsync($"CREATE DATABASE \"{Template}\"", context.CancellationToken);
        await using (var dbContext = new IdentityDbContext(OptionsFor(Template)))
        {
            await dbContext.Database.MigrateAsync(context.CancellationToken);
        }

        // A database is copied only while nobody is connected to it.
        NpgsqlConnection.ClearAllPools();
    }

    [AssemblyCleanup]
    public static async Task StopAsync()
    {
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }

    /// <summary>A database of the caller's own, migrated and empty.</summary>
    public static async Task<DbContextOptions<IdentityDbContext>> NewDatabaseAsync(CancellationToken cancellationToken)
    {
        var name = $"test_{Guid.NewGuid():N}";
        await ExecuteAsync($"CREATE DATABASE \"{name}\" TEMPLATE \"{Template}\"", cancellationToken);
        return OptionsFor(name);
    }

    /// <summary>Another connection to the database <paramref name="existing"/> uses: what a second request of the service would have.</summary>
    public static IdentityDbContext Reopen(IdentityDbContext existing)
    {
        ArgumentNullException.ThrowIfNull(existing);
        return new IdentityDbContext(
            new DbContextOptionsBuilder<IdentityDbContext>()
                .UseNpgsql(existing.Database.GetConnectionString())
                .UseSnakeCaseNamingConvention()
                .AddInterceptors(new AuditingInterceptor(new TestActor(), TimeProvider.System))
                .Options);
    }

    /// <summary>The app's options (snake case, the auditing interceptor) on one database of the container.</summary>
    private static DbContextOptions<IdentityDbContext> OptionsFor(string database) =>
        new DbContextOptionsBuilder<IdentityDbContext>()
            .UseNpgsql(new NpgsqlConnectionStringBuilder(Container.GetConnectionString()) { Database = database }.ConnectionString)
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(new AuditingInterceptor(new TestActor(), TimeProvider.System))
            .Options;

    private static async Task ExecuteAsync(string sql, CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(Container.GetConnectionString());
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private sealed class TestActor : ICurrentActor
    {
        public Guid UserId => SystemUser.Id;
    }
}
