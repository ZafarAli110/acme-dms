using Acme.Gateway.Persistence.Database;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Acme.Gateway.Persistence;

public static class PersistenceServiceCollectionExtensions
{
    public static IServiceCollection AddPersistence(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<GatewayDbContext>(options => options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention());
        return services;
    }

    /// <summary>Applies the gateway's migrations as it starts, as every service does with its own database.</summary>
    public static async Task MigrateDatabaseAsync(this IServiceProvider services, CancellationToken cancellationToken)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<GatewayDbContext>().Database.MigrateAsync(cancellationToken);
    }
}
