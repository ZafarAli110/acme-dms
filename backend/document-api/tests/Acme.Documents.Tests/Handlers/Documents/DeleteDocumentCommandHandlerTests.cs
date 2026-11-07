using Acme.Documents.BusinessLogic.Handlers.Documents.Delete;
using Acme.Documents.BusinessLogic.Handlers.Documents.Process;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Entities;
using Acme.Documents.Persistence.Messaging;
using Moq;
using Microsoft.EntityFrameworkCore;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;
using Acme.Documents.BusinessLogic.Abstractions.Exceptions;

namespace Acme.Documents.Tests.Handlers.Documents;

[TestClass]
public sealed class DeleteDocumentCommandHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_DeletesTheDocumentAndItsContent()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var dbContext = database.CreateContext(TestDocuments.Northwind);

        await new DeleteDocumentCommandHandler(dbContext, new TestUnitOfWork(dbContext))
            .ExecuteAsync(TestDocuments.Alice, documentId, TestContext.CancellationToken);

        await using var check = database.CreateContext(TestDocuments.Northwind);
        Assert.IsFalse(await check.Documents.AnyAsync(d => d.Id == documentId, TestContext.CancellationToken));
        Assert.IsFalse(await check.DocumentContents.AnyAsync(c => c.DocumentId == documentId, TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task ExecuteAsync_KeepsTheDocumentRecordMarkedAsDeleted()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var dbContext = database.CreateContext(TestDocuments.Northwind);

        await new DeleteDocumentCommandHandler(dbContext, new TestUnitOfWork(dbContext))
            .ExecuteAsync(TestDocuments.Alice, documentId, TestContext.CancellationToken);

        await using var check = database.CreateContext(TestDocuments.Northwind);
        var deleted = await check.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken);
        Assert.IsTrue(deleted.IsDeleted);
        Assert.AreEqual(TestDatabase.Now, deleted.DeletedAt);
        Assert.AreEqual(TestDatabase.ActorId, deleted.DeletedBy);
        Assert.AreEqual(TestDatabase.ActorId, deleted.CreatedBy);
    }

    [TestMethod]
    public async Task ExecuteAsync_DoesNotDeleteAnotherDealersDocument()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var otherDealerContext = database.CreateContext(TestDocuments.OtherDealer);
        var otherDealerUser = new UserContext(Guid.NewGuid(), TestDocuments.OtherDealer, Guid.NewGuid());

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            new DeleteDocumentCommandHandler(otherDealerContext, new TestUnitOfWork(otherDealerContext))
                .ExecuteAsync(otherDealerUser, documentId, TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.NotFound, ex.Category);
        await using var check = database.CreateContext(TestDocuments.Northwind);
        Assert.IsTrue(await check.Documents.AnyAsync(d => d.Id == documentId, TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task ExecuteAsync_ADocumentProcessedWhileItIsDeleted_StaysReady_WithItsVariantsRemoved()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var dbContext = database.CreateContext(TestDocuments.Northwind);
        // Processing finishes between the delete reading the document and saving it.
        var processMeanwhile = new TestUnitOfWork(dbContext, async () =>
        {
            await using var backgroundContext = database.CreateContext(dealerId: null);
            await new ProcessDocumentCommandHandler(backgroundContext, new FakeImageProcessor(), new Mock<IOutbox>().Object, new TestUnitOfWork(backgroundContext), TimeProvider.System)
                .ExecuteAsync(new ProcessDocumentMessageDto(documentId, TestDocuments.Northwind), TestContext.CancellationToken);
        });

        await new DeleteDocumentCommandHandler(dbContext, processMeanwhile).ExecuteAsync(TestDocuments.Alice, documentId, TestContext.CancellationToken);

        await using var check = database.CreateContext(dealerId: null);
        var document = await check.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken);
        Assert.IsTrue(document.IsDeleted);
        Assert.AreEqual(DocumentStatus.Ready, document.Status, "the delete does not write back the status it first read");
        Assert.IsFalse(await check.DocumentContents.AnyAsync(c => c.DocumentId == documentId, TestContext.CancellationToken), "the variants go too");
    }
}
