using Acme.Documents.BusinessLogic.Handlers.Documents.Delete;
using Acme.Documents.BusinessLogic.Handlers.Documents.Fail;
using Acme.Documents.BusinessLogic.Handlers.Documents.Sweep;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Entities;
using Acme.Documents.Persistence.Messaging;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Acme.Documents.Tests.Handlers.Documents;

/// <summary>The way out of Pending: a document whose processing never finished is failed, and says so.</summary>
[TestClass]
public sealed class SweepDocumentsCommandHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_FailsADocumentStillPendingAfterTheDeadline_AndPublishesDocumentFailed()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var dbContext = database.CreateContext(dealerId: null);
        var outbox = new Mock<IOutbox>();

        var failed = await Sweeper(dbContext, outbox.Object, TestDatabase.Now + SweepDocumentsCommandHandler.PendingDeadline + TimeSpan.FromMinutes(1))
            .ExecuteAsync(TestContext.CancellationToken);

        Assert.AreEqual(1, failed);
        await using var check = database.CreateContext(dealerId: null);
        var document = await check.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == documentId, TestContext.CancellationToken);
        Assert.AreEqual(DocumentStatus.Failed, document.Status);
        Assert.AreEqual(SweepDocumentsCommandHandler.TimedOut, document.FailureReason);
        outbox.Verify(o => o.Add(MessageTypes.DocumentFailed, It.IsAny<DocumentFailedMessageDto>()), Times.Once);
    }

    [TestMethod]
    public async Task ExecuteAsync_LeavesADocumentBeforeItsDeadline_AndADeletedOne()
    {
        var database = await TestDatabase.CreateAsync(TestContext.CancellationToken);
        var recent = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        var deleted = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using (var userContext = database.CreateContext(TestDocuments.Northwind))
        {
            await new DeleteDocumentCommandHandler(userContext, new TestUnitOfWork(userContext))
                .ExecuteAsync(TestDocuments.Alice, deleted, TestContext.CancellationToken);
        }

        await using var dbContext = database.CreateContext(dealerId: null);
        var outbox = new Mock<IOutbox>();
        var sweeper = Sweeper(dbContext, outbox.Object, TestDatabase.Now + SweepDocumentsCommandHandler.PendingDeadline - TimeSpan.FromMinutes(1));
        Assert.AreEqual(0, await sweeper.ExecuteAsync(TestContext.CancellationToken), "not yet due");

        var later = Sweeper(dbContext, outbox.Object, TestDatabase.Now + SweepDocumentsCommandHandler.PendingDeadline + TimeSpan.FromMinutes(1));
        Assert.AreEqual(1, await later.ExecuteAsync(TestContext.CancellationToken), "only the one not deleted");
        await using var check = database.CreateContext(dealerId: null);
        var stillDeleted = await check.Documents.IgnoreQueryFilters().SingleAsync(d => d.Id == deleted, TestContext.CancellationToken);
        Assert.AreEqual(DocumentStatus.Pending, stillDeleted.Status);
        Assert.IsTrue(stillDeleted.IsDeleted);
        Assert.AreNotEqual(recent, deleted);
    }

    private static SweepDocumentsCommandHandler Sweeper(Acme.Documents.Persistence.Database.DocumentsDbContext dbContext, IOutbox outbox, DateTimeOffset now)
    {
        var clock = new Clock(now);
        return new SweepDocumentsCommandHandler(dbContext, new FailDocumentCommandHandler(dbContext, outbox, new TestUnitOfWork(dbContext), clock), clock);
    }

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
