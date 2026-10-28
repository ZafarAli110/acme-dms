using Acme.Documents.BusinessLogic.Handlers.Documents.Delete;
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
        var database = new TestDatabase();
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
        var database = new TestDatabase();
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
        var database = new TestDatabase();
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var contosoContext = database.CreateContext(TestDocuments.Contoso);
        var carol = new UserContext(Guid.NewGuid(), TestDocuments.Contoso, Guid.NewGuid());

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            new DeleteDocumentCommandHandler(contosoContext, new TestUnitOfWork(contosoContext))
                .ExecuteAsync(carol, documentId, TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.NotFound, ex.Category);
        await using var check = database.CreateContext(TestDocuments.Northwind);
        Assert.IsTrue(await check.Documents.AnyAsync(d => d.Id == documentId, TestContext.CancellationToken));
    }
}
