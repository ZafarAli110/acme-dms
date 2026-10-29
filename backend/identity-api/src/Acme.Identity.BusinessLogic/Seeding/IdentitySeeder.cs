using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Seeding;

/// <summary>Applies migrations and inserts the bootstrap demo data if it is missing. Safe to run on every start.</summary>
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

        if (await _dbContext.Dealers.AnyAsync(cancellationToken))
        {
            await AddMissingLocationRolesAsync(cancellationToken);
            return;
        }

        foreach (var (id, name) in DemoData.Dealers)
        {
            _dbContext.Dealers.Add(new Dealer { Id = id, Name = name });
        }

        foreach (var (id, dealerId, code, name) in DemoData.Locations)
        {
            _dbContext.Locations.Add(new Location { Id = id, DealerId = dealerId, Code = code, Name = name });
        }

        foreach (var demoUser in DemoData.Users)
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

    /// <summary>
    /// A demo user given another location after the database was first seeded (Sam works at both Northwind locations)
    /// gets it on the next start, without a reset.
    /// </summary>
    private async Task AddMissingLocationRolesAsync(CancellationToken cancellationToken)
    {
        var demoUserIds = DemoData.Users.Select(u => u.Id).ToList();
        var existing = await _dbContext.UserLocationRoles
            .IgnoreQueryFilters()
            .Where(r => demoUserIds.Contains(r.UserId))
            .Select(r => new { r.UserId, r.LocationId })
            .ToListAsync(cancellationToken);

        foreach (var demoUser in DemoData.Users)
        {
            foreach (var (locationId, role) in demoUser.Roles)
            {
                if (!existing.Contains(new { UserId = demoUser.Id, LocationId = locationId }))
                {
                    _dbContext.UserLocationRoles.Add(new UserLocationRole { UserId = demoUser.Id, LocationId = locationId, Role = role });
                }
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
