using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.Persistence.Auditing;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.Tests.Persistence;

/// <summary>
/// The dealer query filter: a signed-in user's queries see only their own dealer's users, locations and roles, even
/// a query that does not filter by dealer itself.
/// </summary>
[TestClass]
public sealed class DealerFilterTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task Queries_SeeOnlyTheSignedInUsersDealer()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken, new Actor(DemoData.NorthwindMotors));

        var userDealers = await dbContext.Users.Select(u => u.DealerId).Distinct().ToListAsync(TestContext.CancellationToken);
        var locationDealers = await dbContext.Locations.Select(l => l.DealerId).Distinct().ToListAsync(TestContext.CancellationToken);
        var roleLocations = await dbContext.UserLocationRoles.Select(r => r.LocationId).ToListAsync(TestContext.CancellationToken);
        var dealers = await dbContext.Dealers.Select(d => d.Id).ToListAsync(TestContext.CancellationToken);

        CollectionAssert.AreEqual(new[] { DemoData.NorthwindMotors }, userDealers);
        CollectionAssert.AreEqual(new[] { DemoData.NorthwindMotors }, locationDealers);
        CollectionAssert.DoesNotContain(roleLocations, DemoData.Central);
        CollectionAssert.AreEqual(new[] { DemoData.NorthwindMotors }, dealers);
    }

    [TestMethod]
    public async Task Queries_FindNoOtherDealersUserEvenByEmail()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken, new Actor(DemoData.NorthwindMotors));

        var tom = await dbContext.Users.SingleOrDefaultAsync(u => u.Email == "tom@citymotors.test", TestContext.CancellationToken);

        Assert.IsNull(tom);
    }

    [TestMethod]
    public async Task Queries_SeeEveryDealerWithNoOneSignedIn()
    {
        // Sign-in looks a user up by email before anyone is signed in: across every dealer.
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken, new Actor(null));

        var dealers = await dbContext.Users.Select(u => u.DealerId).Distinct().CountAsync(TestContext.CancellationToken);

        Assert.AreEqual(2, dealers);
    }

    private sealed class Actor : ICurrentActor
    {
        public Actor(Guid? dealerId)
        {
            DealerId = dealerId;
        }

        public Guid UserId { get; } = Guid.NewGuid();

        public Guid? DealerId { get; }
    }
}
