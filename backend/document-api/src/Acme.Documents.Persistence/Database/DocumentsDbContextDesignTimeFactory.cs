using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Acme.Documents.Persistence.Database;

/// <summary>Lets `dotnet ef migrations add` build the context without starting the service.</summary>
internal sealed class DocumentsDbContextDesignTimeFactory : IDesignTimeDbContextFactory<DocumentsDbContext>
{
    public DocumentsDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<DocumentsDbContext>()
            .UseNpgsql("Host=localhost;Database=documents")
            .UseSnakeCaseNamingConvention()
            .Options;
        return new DocumentsDbContext(options, new NoDealerScope());
    }

    private sealed class NoDealerScope : IDealerScope
    {
        public Guid? DealerId => null;
    }
}
