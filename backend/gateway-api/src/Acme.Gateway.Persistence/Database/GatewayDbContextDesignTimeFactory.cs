using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Acme.Gateway.Persistence.Database;

/// <summary>Lets `dotnet ef migrations add` build the context without starting the gateway.</summary>
internal sealed class GatewayDbContextDesignTimeFactory : IDesignTimeDbContextFactory<GatewayDbContext>
{
    public GatewayDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<GatewayDbContext>()
            .UseNpgsql("Host=localhost;Database=gateway")
            .UseSnakeCaseNamingConvention()
            .Options;
        return new GatewayDbContext(options);
    }
}
