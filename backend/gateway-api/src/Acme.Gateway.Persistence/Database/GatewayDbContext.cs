using Acme.Gateway.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Acme.Gateway.Persistence.Database;

/// <summary>The gateway's own database: the browsers' sign-ins, shared by every gateway instance.</summary>
public sealed class GatewayDbContext : DbContext
{
    public GatewayDbContext(DbContextOptions<GatewayDbContext> options)
        : base(options)
    {
    }

    public DbSet<Session> Sessions => Set<Session>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.Entity<Session>(session =>
        {
            session.HasKey(s => s.Id);
            session.Property(s => s.Id).HasMaxLength(64);
            // Sessions that ran out are deleted by when they end.
            session.HasIndex(s => s.ExpiresAt);
        });
    }
}
