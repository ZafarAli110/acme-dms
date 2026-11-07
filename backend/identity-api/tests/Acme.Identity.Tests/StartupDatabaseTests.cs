using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Acme.Identity.Service;
using Acme.Identity.Tests.Support;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Moq;

namespace Acme.Identity.Tests;

/// <summary>What the service does to its database as it starts: migrations everywhere, demo data in Development only.</summary>
[TestClass]
public sealed class StartupDatabaseTests
{
    private static readonly Guid _realDealer = Guid.Parse("90000000-0000-0000-0000-000000000001");
    private static readonly Guid _realUser = Guid.Parse("90000000-0000-0000-0000-000000000002");

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task PrepareAsync_OutsideDevelopment_KeepsRealUsersAndAddsNoDemoUser()
    {
        var options = await DatabaseWithARealUserAsync();

        await StartupDatabase.PrepareAsync(Services(options), Environment(Environments.Production), TestContext.CancellationToken);

        await using var dbContext = new IdentityDbContext(options);
        Assert.IsTrue(await dbContext.Users.AnyAsync(u => u.Id == _realUser, TestContext.CancellationToken), "a real user survives the start");
        Assert.IsFalse(await dbContext.Users.AnyAsync(u => u.Email == DemoData.Users[0].Email, TestContext.CancellationToken), "no demo user, no shared password");
    }

    [TestMethod]
    public async Task PrepareAsync_InDevelopment_PutsTheDemoDataInPlace()
    {
        var options = await DatabaseWithARealUserAsync();

        await StartupDatabase.PrepareAsync(Services(options), Environment(Environments.Development), TestContext.CancellationToken);

        await using var dbContext = new IdentityDbContext(options);
        Assert.IsFalse(await dbContext.Users.IgnoreQueryFilters().AnyAsync(u => u.Id == _realUser, TestContext.CancellationToken), "the demo keeps only its own users");
        Assert.IsTrue(await dbContext.Users.AnyAsync(u => u.Email == DemoData.Users[0].Email, TestContext.CancellationToken));
    }

    private async Task<DbContextOptions<IdentityDbContext>> DatabaseWithARealUserAsync()
    {
        var options = await TestPostgres.NewDatabaseAsync(TestContext.CancellationToken);
        await using var dbContext = new IdentityDbContext(options);
        dbContext.Dealers.Add(new Dealer { Id = _realDealer, Name = "A real dealer" });
        dbContext.Users.Add(new User { Id = _realUser, DealerId = _realDealer, Email = "someone@real-dealer.example", DisplayName = "Someone", PasswordHash = "not a demo password" });
        await dbContext.SaveChangesAsync(TestContext.CancellationToken);
        return options;
    }

    private static ServiceProvider Services(DbContextOptions<IdentityDbContext> options)
    {
        var services = new ServiceCollection();
        services.AddScoped(_ => new IdentityDbContext(options));
        services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddScoped<IdentitySeeder>();
        return services.BuildServiceProvider();
    }

    private static IHostEnvironment Environment(string name)
    {
        var environment = new Mock<IHostEnvironment>();
        environment.SetupGet(e => e.EnvironmentName).Returns(name);
        return environment.Object;
    }
}
