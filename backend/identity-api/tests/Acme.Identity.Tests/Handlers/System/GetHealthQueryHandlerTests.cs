using Acme.Identity.BusinessLogic.Handlers.System.GetHealth;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.Tests.Handlers.System;

[TestClass]
public sealed class GetHealthQueryHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_ReportsTheSharedHealthShape()
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>().UseInMemoryDatabase(nameof(ExecuteAsync_ReportsTheSharedHealthShape)).Options;
        await using var dbContext = new IdentityDbContext(options);
        var handler = new GetHealthQueryHandler(dbContext);

        var response = await handler.ExecuteAsync(TestContext.CancellationToken);

        Assert.AreEqual("identity-api", response.Service);
        Assert.AreEqual("ok", response.Status);
        StringAssert.Matches(response.Version, new global::System.Text.RegularExpressions.Regex(@"^\d+\.\d+\.\d+$"));
        Assert.IsTrue(response.DatabaseReachable == true);
    }
}
