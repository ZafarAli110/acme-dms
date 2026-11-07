using Acme.Documents.BusinessLogic.Handlers.Documents.ForgetUnclaimed;
using Acme.Documents.DTO.Messages;
using Microsoft.EntityFrameworkCore;

namespace Acme.Documents.Tests.Handlers.Documents;

/// <summary>A document no record claimed: deleted when the owning service says so, and only for its own dealer.</summary>
[TestClass]
public sealed class ForgetUnclaimedDocumentCommandHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_DeletesTheDocumentAndItsContent_AndASecondMessageChangesNothing()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var dbContext = database.CreateContext(dealerId: null);
        var handler = new ForgetUnclaimedDocumentCommandHandler(dbContext, new TestUnitOfWork(dbContext));

        await handler.ExecuteAsync(new ProcessDocumentMessageDto(documentId, TestDocuments.Northwind), TestContext.CancellationToken);
        await handler.ExecuteAsync(new ProcessDocumentMessageDto(documentId, TestDocuments.Northwind), TestContext.CancellationToken);

        await using var check = database.CreateContext(dealerId: null);
        Assert.IsTrue((await check.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken)).IsDeleted);
        Assert.IsFalse(await check.DocumentContents.AnyAsync(c => c.DocumentId == documentId, TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task ExecuteAsync_LeavesAnotherDealersDocumentAlone()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var dbContext = database.CreateContext(dealerId: null);

        await new ForgetUnclaimedDocumentCommandHandler(dbContext, new TestUnitOfWork(dbContext))
            .ExecuteAsync(new ProcessDocumentMessageDto(documentId, TestDocuments.OtherDealer), TestContext.CancellationToken);

        await using var check = database.CreateContext(dealerId: null);
        Assert.IsFalse((await check.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken)).IsDeleted);
    }
}
