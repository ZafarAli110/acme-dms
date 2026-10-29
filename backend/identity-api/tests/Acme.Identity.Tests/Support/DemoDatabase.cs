using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.Tests.Support;

/// <summary>An in-memory identity database holding the demo dealer, locations and users, one per test.</summary>
internal static class DemoDatabase
{
    public static async Task<IdentityDbContext> CreateAsync(CancellationToken cancellationToken)
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var dbContext = new IdentityDbContext(options);
        var hasher = new PasswordHasher<User>();
        foreach (var (id, name) in DemoData.Dealers)
        {
            dbContext.Dealers.Add(new Dealer { Id = id, Name = name });
        }

        foreach (var (id, dealerId, code, name) in DemoData.Locations)
        {
            dbContext.Locations.Add(new Location { Id = id, DealerId = dealerId, Code = code, Name = name });
        }

        foreach (var demoUser in DemoData.Users)
        {
            var user = new User { Id = demoUser.Id, DealerId = demoUser.DealerId, Email = demoUser.Email, DisplayName = demoUser.DisplayName };
            user.PasswordHash = hasher.HashPassword(user, DemoData.Password);
            foreach (var (locationId, role) in demoUser.Roles)
            {
                user.LocationRoles.Add(new UserLocationRole { UserId = user.Id, LocationId = locationId, Role = role });
            }

            dbContext.Users.Add(user);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return dbContext;
    }
}
