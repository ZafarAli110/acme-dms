using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Acme.Documents.Persistence.Auditing;
using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Messaging;
using Acme.Documents.Persistence.Transactions;

namespace Acme.Documents.Persistence;

public static class PersistenceServiceCollectionExtensions
{
    public static IServiceCollection AddPersistence(this IServiceCollection services, string connectionString)
    {
        // Every save goes through the auditing interceptor: audit columns and soft delete (see AuditedEntity).
        services.AddScoped<AuditingInterceptor>();
        services.AddDbContext<DocumentsDbContext>((provider, options) => options
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(provider.GetRequiredService<AuditingInterceptor>()));
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IOutbox, Outbox>();
        return services;
    }

    /// <summary>Applies pending migrations. Development convenience; run on startup.</summary>
    public static async Task MigrateDocumentsDatabaseAsync(this IServiceProvider services, CancellationToken cancellationToken)
    {
        using var scope = services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<DocumentsDbContext>();
        await dbContext.Database.MigrateAsync(cancellationToken);
    }
}
