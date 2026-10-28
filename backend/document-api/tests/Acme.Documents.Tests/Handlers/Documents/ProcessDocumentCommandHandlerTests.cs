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
        var database = new TestDatabase();
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
}
