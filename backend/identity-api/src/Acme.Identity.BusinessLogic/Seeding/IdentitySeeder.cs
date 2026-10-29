using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Seeding;

/// <summary>
/// Keeps the identity database in line with <see cref="DemoData"/>. Development only.
/// On every start it adds what is missing and removes dealers, locations and users the demo no longer has. It never
/// touches the locations of a demo user who already exists: a manager may have changed them, and a restart must not
/// undo that. <see cref="ResetDemoUsersAsync"/> puts them back (`bun run reset`).
/// </summary>
public sealed class IdentitySeeder
{
    private readonly IdentityDbContext _dbContext;
    private readonly IPasswordHasher<User> _passwordHasher;

    public IdentitySeeder(IdentityDbContext dbContext, IPasswordHasher<User> passwordHasher)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
    }

    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        await _dbContext.Database.MigrateAsync(cancellationToken);
        await RemoveRetiredAsync(cancellationToken);
        await AddMissingAsync(cancellationToken);
    }

    /// <summary>Gives every demo user exactly the locations and roles <see cref="DemoData"/> lists.</summary>
    public async Task ResetDemoUsersAsync(CancellationToken cancellationToken)
    {
        var demoUserIds = DemoData.Users.Select(u => u.Id).ToList();
        // Hard deletes: a reset forgets the history too, so a location can be assigned again without a clash.
        await _dbContext.UserLocationRoles.IgnoreQueryFilters()
            .Where(r => demoUserIds.Contains(r.UserId))
            .ExecuteDeleteAsync(cancellationToken);
        foreach (var demoUser in DemoData.Users)
        {
            foreach (var (locationId, role) in demoUser.Roles)
            {
                _dbContext.UserLocationRoles.Add(new UserLocationRole { UserId = demoUser.Id, LocationId = locationId, Role = role });
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Demo users, locations and dealers that have since been dropped (Alice, Tom, Bob, Contoso).</summary>
    private async Task RemoveRetiredAsync(CancellationToken cancellationToken)
    {
        var userIds = DemoData.Users.Select(u => u.Id).ToList();
        var locationIds = DemoData.Locations.Select(l => l.Id).ToList();
        var dealerIds = DemoData.Dealers.Select(d => d.Id).ToList();

        await _dbContext.UserLocationRoles.IgnoreQueryFilters()
            .Where(r => !userIds.Contains(r.UserId) || !locationIds.Contains(r.LocationId))
            .ExecuteDeleteAsync(cancellationToken);
        await _dbContext.Users.IgnoreQueryFilters().Where(u => !userIds.Contains(u.Id)).ExecuteDeleteAsync(cancellationToken);
        await _dbContext.Locations.IgnoreQueryFilters().Where(l => !locationIds.Contains(l.Id)).ExecuteDeleteAsync(cancellationToken);
        await _dbContext.Dealers.IgnoreQueryFilters().Where(d => !dealerIds.Contains(d.Id)).ExecuteDeleteAsync(cancellationToken);
    }

    /// <summary>A demo dealer, location or user that isn't there yet; a new user gets the locations the demo lists.</summary>
    private async Task AddMissingAsync(CancellationToken cancellationToken)
    {
        var dealerIds = await _dbContext.Dealers.IgnoreQueryFilters().Select(d => d.Id).ToListAsync(cancellationToken);
        foreach (var (id, name) in DemoData.Dealers.Where(d => !dealerIds.Contains(d.Id)))
        {
            _dbContext.Dealers.Add(new Dealer { Id = id, Name = name });
        }

        var locationIds = await _dbContext.Locations.IgnoreQueryFilters().Select(l => l.Id).ToListAsync(cancellationToken);
        foreach (var (id, dealerId, code, name) in DemoData.Locations.Where(l => !locationIds.Contains(l.Id)))
        {
            _dbContext.Locations.Add(new Location { Id = id, DealerId = dealerId, Code = code, Name = name });
        }

        var userIds = await _dbContext.Users.IgnoreQueryFilters().Select(u => u.Id).ToListAsync(cancellationToken);
        foreach (var demoUser in DemoData.Users.Where(u => !userIds.Contains(u.Id)))
        {
            var user = new User { Id = demoUser.Id, DealerId = demoUser.DealerId, Email = demoUser.Email, DisplayName = demoUser.DisplayName };
            user.PasswordHash = _passwordHasher.HashPassword(user, DemoData.Password);
            foreach (var (locationId, role) in demoUser.Roles)
            {
                user.LocationRoles.Add(new UserLocationRole { UserId = user.Id, LocationId = locationId, Role = role });
            }

            _dbContext.Users.Add(user);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
