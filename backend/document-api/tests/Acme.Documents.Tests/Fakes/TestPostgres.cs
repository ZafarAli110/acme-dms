using Acme.Documents.Persistence.Database;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Testcontainers.PostgreSql;

namespace Acme.Documents.Tests;

/// <summary>
/// One real Postgres for the whole test run (Testcontainers, the image the app runs on), with the service's own
/// migrations applied once to a template database; every test gets a fresh copy of it. Real SQL, real constraints:
/// what EF's in-memory provider never checks.
/// </summary>
[TestClass]
public static class TestPostgres
{
    private const string Image = "postgres:18.3";
    private const string Template = "documents_template";

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
        await using (var dbContext = new DocumentsDbContext(OptionsFor(Template), new TestDealerScope(null)))
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

    /// <summary>A database of the caller's own, migrated and empty: its connection string.</summary>
    public static async Task<string> NewDatabaseAsync(CancellationToken cancellationToken)
    {
        var name = $"test_{Guid.NewGuid():N}";
        await ExecuteAsync($"CREATE DATABASE \"{name}\" TEMPLATE \"{Template}\"", cancellationToken);
        return ConnectionStringFor(name);
    }

    /// <summary>The connection string of one database of the container.</summary>
    public static string ConnectionStringFor(string database) =>
        new NpgsqlConnectionStringBuilder(Container.GetConnectionString()) { Database = database }.ConnectionString;

    /// <summary>The app's options (snake case) on one database of the container.</summary>
    private static DbContextOptions<DocumentsDbContext> OptionsFor(string database) =>
        new DbContextOptionsBuilder<DocumentsDbContext>()
            .UseNpgsql(ConnectionStringFor(database))
            .UseSnakeCaseNamingConvention()
            .Options;

    private static async Task ExecuteAsync(string sql, CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(Container.GetConnectionString());
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
