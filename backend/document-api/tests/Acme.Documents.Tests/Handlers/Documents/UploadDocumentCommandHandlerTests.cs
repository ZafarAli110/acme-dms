using Acme.Documents.DTO.Messages;
using Acme.Documents.Persistence.Entities;
using Moq;
using Acme.Documents.BusinessLogic.Abstractions.Exceptions;
using Acme.Documents.Persistence.Messaging;

namespace Acme.Documents.Tests.Handlers.Documents;

[TestClass]
public sealed class UploadDocumentCommandHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_StoresThePendingDocumentAndQueuesProcessing()
    {
        var database = new TestDatabase();
        await using var dbContext = database.CreateContext(TestDocuments.Northwind);
        var outbox = new Mock<IOutbox>();

        var response = await TestDocuments.CreateUploadHandler(dbContext, outbox.Object)
            .ExecuteAsync(TestDocuments.Alice, TestDocuments.PhotoUpload(), TestContext.CancellationToken);

        Assert.AreEqual(nameof(DocumentStatus.Pending), response.Status);
        outbox.Verify(
            o => o.Add(MessageTypes.ProcessDocument, It.Is<ProcessDocumentMessageDto>(m => m.DocumentId == response.Id && m.DealerId == TestDocuments.Northwind)),
            Times.Once);
    }

    [TestMethod]
    public async Task ExecuteAsync_RejectsVariantsForANonImage()
    {
        var database = new TestDatabase();
        await using var dbContext = database.CreateContext(TestDocuments.Northwind);
        var request = TestDocuments.PhotoUpload() with { ContentType = "application/pdf" };

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            TestDocuments.CreateUploadHandler(dbContext).ExecuteAsync(TestDocuments.Alice, request, TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.BadRequest, ex.Category);
    }
}
