using Acme.Documents.BusinessLogic.Handlers.Documents.Get;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;
using Acme.Documents.BusinessLogic.Abstractions.Exceptions;

namespace Acme.Documents.Tests.Handlers.Documents;

[TestClass]
public sealed class GetDocumentQueryHandlerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_DoesNotReturnAnotherDealersDocument()
    {
        var database = new TestDatabase();
        var documentId = await TestDocuments.UploadPhotoAsync(database, TestContext.CancellationToken);
        await using var contosoContext = database.CreateContext(TestDocuments.Contoso);
        var carol = new UserContext(Guid.NewGuid(), TestDocuments.Contoso, Guid.NewGuid());

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            new GetDocumentQueryHandler(contosoContext).ExecuteAsync(carol, documentId, TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.NotFound, ex.Category);
    }
}
