using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Authorization;
using Acme.Identity.BusinessLogic.Handlers.Users.AssignLocation;
using Acme.Identity.BusinessLogic.Handlers.Users.GetList;
using Acme.Identity.BusinessLogic.Handlers.Users.UnassignLocation;
using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Transactions;
using Acme.Identity.Tests.Support;
using Moq;

namespace Acme.Identity.Tests.Handlers.Users;

[TestClass]
public sealed class UserLocationAssignmentTests
{
    private static readonly Guid _maria = DemoData.Users.Single(u => u.Email == "maria@northwind.test").Id;
    private static readonly Guid _sam = DemoData.Users.Single(u => u.Email == "sam@northwind.test").Id;
    private static readonly Guid _rita = DemoData.Users.Single(u => u.Email == "rita@northwind.test").Id;
    private static readonly UserContext _asMaria = new(_maria, DemoData.NorthwindMotors, DemoData.Northside);
    private static readonly UserContext _asSam = new(_sam, DemoData.NorthwindMotors, DemoData.Northside);
    private static readonly string[] _everyoneByName = ["Maria Service Manager", "Rita Service Advisor", "Sam Service Advisor"];

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task GetUsers_ListsEveryoneAtTheDealerWithTheirJobAndLocations()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);

        var users = await new GetUsersQueryHandler(dbContext).ExecuteAsync(_asMaria, TestContext.CancellationToken);

        CollectionAssert.AreEqual(_everyoneByName, users.Select(u => u.DisplayName).ToList());
        var sam = users.Single(u => u.Id == _sam);
        Assert.AreEqual(Roles.ServiceAdvisor, sam.Role);
        CollectionAssert.AreEquivalent(new[] { DemoData.Northside, DemoData.Riverside }, sam.LocationIds.ToList());
    }

    [TestMethod]
    public async Task Assign_GivesTheUserTheLocationInTheJobTheyAlreadyHave()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);

        var sam = await Assign(dbContext).ExecuteAsync(_asMaria, _sam, DemoData.Westgate, TestContext.CancellationToken);

        CollectionAssert.AreEquivalent(new[] { DemoData.Northside, DemoData.Riverside, DemoData.Westgate }, sam.LocationIds.ToList());
        Assert.AreEqual(Roles.ServiceAdvisor, dbContext.UserLocationRoles.Single(r => r.UserId == _sam && r.LocationId == DemoData.Westgate).Role);
    }

    [TestMethod]
    public async Task Assign_ALocationTheUserAlreadyHasChangesNothing()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);

        var sam = await Assign(dbContext).ExecuteAsync(_asMaria, _sam, DemoData.Northside, TestContext.CancellationToken);

        CollectionAssert.AreEquivalent(new[] { DemoData.Northside, DemoData.Riverside }, sam.LocationIds.ToList());
    }

    [TestMethod]
    public async Task Unassign_TakesTheLocationAwayAndItCanBeAssignedAgain()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var afterUnassign = await Unassign(dbContext).ExecuteAsync(_asMaria, _sam, DemoData.Riverside, TestContext.CancellationToken);
        var afterAssign = await Assign(dbContext).ExecuteAsync(_asMaria, _sam, DemoData.Riverside, TestContext.CancellationToken);

        CollectionAssert.AreEqual(new[] { DemoData.Northside }, afterUnassign.LocationIds.ToList());
        CollectionAssert.AreEquivalent(new[] { DemoData.Northside, DemoData.Riverside }, afterAssign.LocationIds.ToList());
    }

    [TestMethod]
    public async Task Unassign_RefusesTheUsersLastLocation()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        await Unassign(dbContext).ExecuteAsync(_asMaria, _sam, DemoData.Riverside, TestContext.CancellationToken);

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Unassign(dbContext).ExecuteAsync(_asMaria, _sam, DemoData.Northside, TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.Conflict, ex.Category);
        Assert.AreEqual(1, dbContext.UserLocationRoles.Count(r => r.UserId == _sam));
    }

    [TestMethod]
    public async Task Assign_IsRefusedForSomeoneWhoDoesNotManageTheLocation()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Assign(dbContext).ExecuteAsync(_asSam, _rita, DemoData.Northside, TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.Forbidden, ex.Category);
    }

    [TestMethod]
    public async Task Unassign_RefusesAManagerChangingTheirOwnLocations()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Unassign(dbContext).ExecuteAsync(_asMaria, _maria, DemoData.Riverside, TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.Forbidden, ex.Category);
    }

    [TestMethod]
    public async Task Assign_AnotherDealersLocationIsNotFound()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Assign(dbContext).ExecuteAsync(_asMaria, _sam, Guid.NewGuid(), TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.NotFound, ex.Category);
    }

    private static AssignUserLocationCommandHandler Assign(IdentityDbContext dbContext) => new(dbContext, UnitOfWork(dbContext));

    private static UnassignUserLocationCommandHandler Unassign(IdentityDbContext dbContext) => new(dbContext, UnitOfWork(dbContext));

    private static IUnitOfWork UnitOfWork(IdentityDbContext dbContext)
    {
        var unitOfWork = new Mock<IUnitOfWork>();
        unitOfWork.Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>())).Returns<CancellationToken>(dbContext.SaveChangesAsync);
        return unitOfWork.Object;
    }
}
