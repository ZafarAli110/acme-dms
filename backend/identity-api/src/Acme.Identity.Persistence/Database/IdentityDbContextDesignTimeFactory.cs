using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Acme.Identity.Persistence.Database;

/// <summary>Lets `dotnet ef migrations add` build the context without starting the service.</summary>
internal sealed class IdentityDbContextDesignTimeFactory : IDesignTimeDbContextFactory<IdentityDbContext>
{
    public IdentityDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseNpgsql("Host=localhost;Database=identity")
            .UseSnakeCaseNamingConvention()
            .Options;
        return new IdentityDbContext(options);
    }
}
