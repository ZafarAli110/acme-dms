using Acme.Documents.BusinessLogic.Handlers.Documents.Fail;
using Acme.Documents.BusinessLogic.Handlers.Documents.Process;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Entities;
using Acme.Documents.Persistence.Messaging;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Acme.Documents.Tests.Handlers.Documents;

/// <summary>
/// A document moves only out of Pending: to Ready (processed) or Failed (given up), and from either never back. A message
/// can arrive twice or late, so every move is checked against the status it finds (the state sweep's F14).
/// </summary>
[TestClass]
public sealed class DocumentStatusGuardTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task Fail_APendingDocument_IsFailedWithItsReason_AndSaysSoOnce()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var context = database.CreateContext(dealerId: null);
        var outbox = new Mock<IOutbox>();

        await FailHandler(context, outbox).ExecuteAsync(Message(documentId), "the image could not be read", TestContext.CancellationToken);

        var document = await context.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken);
        Assert.AreEqual(DocumentStatus.Failed, document.Status);
        Assert.AreEqual("the image could not be read", document.FailureReason);
        Assert.IsNotNull(document.ProcessedAt);
        outbox.Verify(o => o.Add(MessageTypes.DocumentFailed, It.IsAny<DocumentFailedMessageDto>()), Times.Once);
    }

    [TestMethod]
    public async Task Fail_AReadyDocument_StaysReady_AndPublishesNothing()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var context = database.CreateContext(dealerId: null);
        await ProcessHandler(context, new Mock<IOutbox>()).ExecuteAsync(Message(documentId), TestContext.CancellationToken);
        var outbox = new Mock<IOutbox>();

        await FailHandler(context, outbox).ExecuteAsync(Message(documentId), "late", TestContext.CancellationToken);

        var document = await context.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken);
        Assert.AreEqual(DocumentStatus.Ready, document.Status);
        outbox.VerifyNoOtherCalls();
    }

    [TestMethod]
    public async Task Process_AFailedDocument_StaysFailed_AndPublishesNothing()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var context = database.CreateContext(dealerId: null);
        await FailHandler(context, new Mock<IOutbox>()).ExecuteAsync(Message(documentId), "given up", TestContext.CancellationToken);
        var outbox = new Mock<IOutbox>();

        await ProcessHandler(context, outbox).ExecuteAsync(Message(documentId), TestContext.CancellationToken);

        var document = await context.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken);
        Assert.AreEqual(DocumentStatus.Failed, document.Status);
        outbox.VerifyNoOtherCalls();
    }

    [TestMethod]
    public async Task Process_TheSameMessageTwice_ProcessesOnce()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var context = database.CreateContext(dealerId: null);
        var outbox = new Mock<IOutbox>();
        var handler = ProcessHandler(context, outbox);

        await handler.ExecuteAsync(Message(documentId), TestContext.CancellationToken);
        await handler.ExecuteAsync(Message(documentId), TestContext.CancellationToken);

        outbox.Verify(o => o.Add(MessageTypes.DocumentProcessed, It.IsAny<DocumentProcessedMessageDto>()), Times.Once);
    }

    [TestMethod]
    public async Task TheDatabase_RefusesAStatusItDoesNotKnow_AndAFailedDocumentWithNoReason()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var context = database.CreateContext(dealerId: null);

        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => context.Database.ExecuteSqlInterpolatedAsync(
            $"update documents set status = 'Lost' where id = {documentId}", TestContext.CancellationToken));
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => context.Database.ExecuteSqlInterpolatedAsync(
            $"update documents set status = 'Failed', processed_at = now() where id = {documentId}", TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task Upload_WithNoVariants_IsReadyAndProcessedAtOnce()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        await using var context = database.CreateContext(TestDocuments.Northwind);
        var upload = TestDocuments.PhotoUpload() with { Variants = [] };

        var saved = await TestDocuments.CreateUploadHandler(context).ExecuteAsync(TestDocuments.Alice, upload, TestContext.CancellationToken);

        var document = await context.Documents.SingleAsync(d => d.Id == saved.Id, TestContext.CancellationToken);
        Assert.AreEqual(DocumentStatus.Ready, document.Status);
        Assert.IsNotNull(document.ProcessedAt);
    }

    private static ProcessDocumentMessageDto Message(Guid documentId) => new(documentId, TestDocuments.Northwind);

    private static FailDocumentCommandHandler FailHandler(Persistence.Database.DocumentsDbContext context, Mock<IOutbox> outbox) =>
        new(context, outbox.Object, new TestUnitOfWork(context), TimeProvider.System);

    private static ProcessDocumentCommandHandler ProcessHandler(Persistence.Database.DocumentsDbContext context, Mock<IOutbox> outbox) =>
        new(context, new FakeImageProcessor(), outbox.Object, new TestUnitOfWork(context), TimeProvider.System);
}
