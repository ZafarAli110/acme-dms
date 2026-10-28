using Acme.Documents.BusinessLogic.Handlers.System.GetHealth;
using Microsoft.EntityFrameworkCore;
using Acme.Documents.Persistence.Database;

namespace Acme.Documents.Tests.Handlers.System;

[TestClass]
public sealed class GetHealthQueryHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_ReportsOkWhenTheDatabaseIsReachable()
    {
        var options = new DbContextOptionsBuilder<DocumentsDbContext>().UseInMemoryDatabase(nameof(ExecuteAsync_ReportsOkWhenTheDatabaseIsReachable)).Options;
        await using var dbContext = new DocumentsDbContext(options, new TestDealerScope(null));
        var handler = new GetHealthQueryHandler(dbContext);

        var response = await handler.ExecuteAsync(TestContext.CancellationToken);

        Assert.AreEqual("ok", response.Status);
        Assert.IsTrue(response.DatabaseReachable);
    }
}
