using Acme.Identity.Persistence.Auditing;
using Acme.Identity.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.Persistence.Database;

public sealed class IdentityDbContext : DbContext
{
    /// <summary>The query filter that hides soft-deleted rows.</summary>
    public const string SoftDeleteFilter = "SoftDelete";

    /// <summary>
    /// The query filter that keeps every query to the signed-in user's dealer: their users, locations and roles, and
    /// their own dealer. With no one signed in (sign-in itself, the seeder, key rotation) it filters nothing.
    /// </summary>
    public const string DealerFilter = "Dealer";

    private readonly Guid? _dealerId;

    public IdentityDbContext(DbContextOptions<IdentityDbContext> options, ICurrentActor? currentActor = null)
        : base(options)
    {
        _dealerId = currentActor?.DealerId;
    }

    public DbSet<Dealer> Dealers => Set<Dealer>();

    public DbSet<Location> Locations => Set<Location>();

    public DbSet<User> Users => Set<User>();

    public DbSet<UserLocationRole> UserLocationRoles => Set<UserLocationRole>();

    public DbSet<SigningKey> SigningKeys => Set<SigningKey>();

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);

        modelBuilder.Entity<Dealer>(dealer =>
        {
            dealer.Property(d => d.Name).HasMaxLength(200);
            dealer.ToTable(table => table.HasCheckConstraint("ck_dealers_deleted", "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));
            dealer.HasQueryFilter(SoftDeleteFilter, d => !d.IsDeleted);
            dealer.HasQueryFilter(DealerFilter, d => _dealerId == null || d.Id == _dealerId);
        });

        modelBuilder.Entity<Location>(location =>
        {
            location.Property(l => l.Code).HasMaxLength(20);
            location.Property(l => l.Name).HasMaxLength(200);
            // Unique among the rows that are not deleted, so a deleted location's code can be used again.
            location.HasIndex(l => new { l.DealerId, l.Code }).IsUnique().HasFilter("NOT is_deleted");
            location.ToTable(table => table.HasCheckConstraint("ck_locations_deleted", "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));
            location.HasQueryFilter(SoftDeleteFilter, l => !l.IsDeleted);
            location.HasQueryFilter(DealerFilter, l => _dealerId == null || l.DealerId == _dealerId);
            location.HasOne(l => l.Dealer).WithMany(d => d.Locations).HasForeignKey(l => l.DealerId);
        });

        modelBuilder.Entity<User>(user =>
        {
            user.Property(u => u.Email).HasMaxLength(320);
            user.Property(u => u.DisplayName).HasMaxLength(200);
            user.HasIndex(u => u.Email).IsUnique().HasFilter("NOT is_deleted");
            user.ToTable(table => table.HasCheckConstraint("ck_users_deleted", "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));
            user.HasQueryFilter(SoftDeleteFilter, u => !u.IsDeleted);
            user.HasQueryFilter(DealerFilter, u => _dealerId == null || u.DealerId == _dealerId);
            user.HasOne(u => u.Dealer).WithMany().HasForeignKey(u => u.DealerId);
            user.HasOne<Location>().WithMany().HasForeignKey(u => u.DefaultLocationId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserLocationRole>(role =>
        {
            role.HasKey(r => new { r.UserId, r.LocationId });
            role.Property(r => r.Role).HasMaxLength(50);
            role.ToTable(table => table.HasCheckConstraint("ck_user_location_roles_deleted", "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));
            role.HasQueryFilter(SoftDeleteFilter, r => !r.IsDeleted);
            // Through its location: a role assignment belongs to the dealer of the location it is at.
            role.HasQueryFilter(DealerFilter, r => _dealerId == null || r.Location!.DealerId == _dealerId);
            role.HasOne<User>().WithMany(u => u.LocationRoles).HasForeignKey(r => r.UserId);
            role.HasOne(r => r.Location).WithMany().HasForeignKey(r => r.LocationId);
        });

        modelBuilder.Entity<SigningKey>(key => key.Property(k => k.Id).HasMaxLength(64));

        modelBuilder.Entity<RefreshToken>(token =>
        {
            token.Property(t => t.TokenHash).HasMaxLength(64);
            // Looked up by the hash of what the app sends, and never two the same.
            token.HasIndex(t => t.TokenHash).IsUnique();
            token.HasIndex(t => t.UserId);
            token.HasIndex(t => t.FamilyId);
            token.HasOne<User>().WithMany().HasForeignKey(t => t.UserId);
        });

        modelBuilder.UseDatabaseGeneratedUuidV7Keys();
    }
}
