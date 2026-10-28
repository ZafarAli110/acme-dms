using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Acme.Identity.Persistence.Auditing;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Transactions;

namespace Acme.Identity.Persistence;

public static class PersistenceServiceCollectionExtensions
{
    public static IServiceCollection AddPersistence(this IServiceCollection services, string connectionString)
    {
        // Every save goes through the auditing interceptor: audit columns and soft delete (see AuditedEntity).
        services.AddScoped<AuditingInterceptor>();
        services.AddDbContext<IdentityDbContext>((provider, options) => options
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(provider.GetRequiredService<AuditingInterceptor>()));
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        return services;
    }
}
