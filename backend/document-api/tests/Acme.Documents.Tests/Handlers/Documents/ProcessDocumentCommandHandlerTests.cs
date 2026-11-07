using Acme.Documents.BusinessLogic.Handlers.Documents.Delete;
using Acme.Documents.BusinessLogic.Handlers.Documents.Process;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;
using Acme.Documents.Persistence.Messaging;

namespace Acme.Documents.Tests.Handlers.Documents;

[TestClass]
public sealed class ProcessDocumentCommandHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_ProducesTheVariantsAndPublishesDocumentProcessed()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var backgroundContext = database.CreateContext(dealerId: null);
        var outbox = new Mock<IOutbox>();
        var handler = new ProcessDocumentCommandHandler(backgroundContext, new FakeImageProcessor(), outbox.Object, new TestUnitOfWork(backgroundContext), TimeProvider.System);

        await handler.ExecuteAsync(new ProcessDocumentMessageDto(documentId, TestDocuments.Northwind), TestContext.CancellationToken);

        var document = await backgroundContext.Documents.IgnoreQueryFilters().Include(d => d.Contents).SingleAsync(TestContext.CancellationToken);
        Assert.AreEqual(DocumentStatus.Ready, document.Status);
        Assert.IsTrue(document.Contents.Any(c => c.Name == "display" && c.ContentType == "image/webp"));
        outbox.Verify(o => o.Add(MessageTypes.DocumentProcessed, It.IsAny<DocumentProcessedMessageDto>()), Times.Once);
    }

    [TestMethod]
    public async Task ExecuteAsync_ADocumentDeletedWhileItIsProcessed_IsNotMarkedReady_AndPublishesNothing()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var backgroundContext = database.CreateContext(dealerId: null);
        // The feature undoes the upload while the variants are being made.
        var undoUpload = new TestUnitOfWork(backgroundContext, async () =>
        {
            await using var userContext = database.CreateContext(TestDocuments.Northwind);
            await new DeleteDocumentCommandHandler(userContext, new TestUnitOfWork(userContext))
                .ExecuteAsync(TestDocuments.Alice, documentId, TestContext.CancellationToken);
        });
        var handler = new ProcessDocumentCommandHandler(backgroundContext, new FakeImageProcessor(), new Mock<IOutbox>().Object, undoUpload, TimeProvider.System);

        // The outbox row is written in the same save as the document (Outbox adds it to this context), so a save that
        // fails publishes nothing.
        await Assert.ThrowsExactlyAsync<DbUpdateConcurrencyException>(() =>
            handler.ExecuteAsync(new ProcessDocumentMessageDto(documentId, TestDocuments.Northwind), TestContext.CancellationToken));

        await using var check = database.CreateContext(dealerId: null);
        var document = await check.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken);
        Assert.IsTrue(document.IsDeleted);
        Assert.AreEqual(DocumentStatus.Pending, document.Status, "a deleted document is not marked ready");
    }
}
