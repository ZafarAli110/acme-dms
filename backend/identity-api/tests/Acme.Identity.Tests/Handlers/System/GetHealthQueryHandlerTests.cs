using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Handlers.System.GetHealth;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Acme.Identity.Tests.Handlers.System;

[TestClass]
public sealed class GetHealthQueryHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_ReportsTheSharedHealthShape()
    {
        var options = await TestPostgres.NewDatabaseAsync(TestContext.CancellationToken);
        await using var dbContext = new IdentityDbContext(options);
        var handler = new GetHealthQueryHandler(dbContext, Keys(canSign: true));

        var response = await handler.ExecuteAsync(TestContext.CancellationToken);

        Assert.AreEqual("identity-api", response.Service);
        Assert.AreEqual("ok", response.Status);
        StringAssert.Matches(response.Version, new global::System.Text.RegularExpressions.Regex(@"^\d+\.\d+\.\d+$"));
        Assert.IsTrue(response.DatabaseReachable == true);
    }

    [TestMethod]
    public async Task ExecuteAsync_IsDegraded_WhenThisInstanceCannotOpenTheKeyThatSigns()
    {
        var options = await TestPostgres.NewDatabaseAsync(TestContext.CancellationToken);
        await using var dbContext = new IdentityDbContext(options);
        var handler = new GetHealthQueryHandler(dbContext, Keys(canSign: false));

        var response = await handler.ExecuteAsync(TestContext.CancellationToken);

        Assert.AreEqual("degraded", response.Status);
        Assert.IsTrue(response.DatabaseReachable == true);
    }

    private static ISigningKeyProvider Keys(bool canSign)
    {
        var keys = new Mock<ISigningKeyProvider>();
        keys.Setup(k => k.CanSignAsync(It.IsAny<CancellationToken>())).ReturnsAsync(canSign);
        return keys.Object;
    }
}
