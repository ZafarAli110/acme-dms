using Acme.Identity.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.Persistence.Database;

public sealed class IdentityDbContext : DbContext
{
    public IdentityDbContext(DbContextOptions<IdentityDbContext> options)
        : base(options)
    {
    }

    public DbSet<Dealer> Dealers => Set<Dealer>();

    public DbSet<Location> Locations => Set<Location>();

    public DbSet<User> Users => Set<User>();

    public DbSet<UserLocationRole> UserLocationRoles => Set<UserLocationRole>();

    public DbSet<SigningKey> SigningKeys => Set<SigningKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);

        modelBuilder.Entity<Dealer>(dealer =>
        {
            dealer.Property(d => d.Name).HasMaxLength(200);
            dealer.ToTable(table => table.HasCheckConstraint("ck_dealers_deleted", "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));
            dealer.HasQueryFilter(d => !d.IsDeleted);
        });

        modelBuilder.Entity<Location>(location =>
        {
            location.Property(l => l.Code).HasMaxLength(20);
            location.Property(l => l.Name).HasMaxLength(200);
            // Unique among the rows that are not deleted, so a deleted location's code can be used again.
            location.HasIndex(l => new { l.DealerId, l.Code }).IsUnique().HasFilter("NOT is_deleted");
            location.ToTable(table => table.HasCheckConstraint("ck_locations_deleted", "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));
            location.HasQueryFilter(l => !l.IsDeleted);
            location.HasOne(l => l.Dealer).WithMany(d => d.Locations).HasForeignKey(l => l.DealerId);
        });

        modelBuilder.Entity<User>(user =>
        {
            user.Property(u => u.Email).HasMaxLength(320);
            user.Property(u => u.DisplayName).HasMaxLength(200);
            user.HasIndex(u => u.Email).IsUnique().HasFilter("NOT is_deleted");
            user.ToTable(table => table.HasCheckConstraint("ck_users_deleted", "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));
            user.HasQueryFilter(u => !u.IsDeleted);
            user.HasOne(u => u.Dealer).WithMany().HasForeignKey(u => u.DealerId);
        });

        modelBuilder.Entity<UserLocationRole>(role =>
        {
            role.HasKey(r => new { r.UserId, r.LocationId });
            role.Property(r => r.Role).HasMaxLength(50);
            role.ToTable(table => table.HasCheckConstraint("ck_user_location_roles_deleted", "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));
            role.HasQueryFilter(r => !r.IsDeleted);
            role.HasOne<User>().WithMany(u => u.LocationRoles).HasForeignKey(r => r.UserId);
            role.HasOne(r => r.Location).WithMany().HasForeignKey(r => r.LocationId);
        });

        modelBuilder.Entity<SigningKey>(key => key.Property(k => k.Id).HasMaxLength(64));

        modelBuilder.UseDatabaseGeneratedUuidV7Keys();
    }
}
