using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.Service;

/// <summary>What identity-api does to its database as it starts.</summary>
public static class StartupDatabase
{
    /// <summary>
    /// Applies the migrations in every environment. Only Development gets the demo data: the seeder deletes every
    /// dealer, location and user the demo does not list, and signs the demo users in with one shared password.
    /// </summary>
    public static async Task PrepareAsync(IServiceProvider services, IHostEnvironment environment, CancellationToken cancellationToken)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Database.MigrateAsync(cancellationToken);
        if (environment.IsDevelopment())
        {
            await scope.ServiceProvider.GetRequiredService<IdentitySeeder>().SeedAsync(cancellationToken);
        }
    }
}
