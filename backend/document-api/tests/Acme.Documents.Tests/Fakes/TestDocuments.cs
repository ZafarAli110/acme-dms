using Acme.Documents.BusinessLogic.Handlers.Documents.Upload;
using Acme.Documents.DTO.Documents;
using Moq;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;
using Acme.Documents.Persistence.Database;
using Acme.Documents.Persistence.Messaging;

namespace Acme.Documents.Tests;

internal static class TestDocuments
{
    public static readonly Guid Northwind = Guid.Parse("10000000-0000-0000-0000-000000000001");
    public static readonly Guid Contoso = Guid.Parse("10000000-0000-0000-0000-000000000002");
    public static readonly UserContext Alice = new(Guid.NewGuid(), Northwind, Guid.NewGuid());

    public static DocumentUploadRequestDto PhotoUpload() =>
        new("part", Guid.NewGuid(), "brake-pads.jpg", "image/jpeg", new byte[] { 0xFF, 0xD8, 0xFF }, [new VariantSpecDto("display", 1200, 82)]);

    public static UploadDocumentCommandHandler CreateUploadHandler(DocumentsDbContext dbContext, IOutbox? outbox = null) =>
        new(dbContext, outbox ?? Mock.Of<IOutbox>(), new TestUnitOfWork(dbContext));

    /// <summary>Uploads a photo for Alice (Northwind) and returns its id.</summary>
    public static async Task<Guid> UploadPhotoAsync(TestDatabase database, CancellationToken cancellationToken)
    {
        await using var dbContext = database.CreateContext(Northwind);
        return (await CreateUploadHandler(dbContext).ExecuteAsync(Alice, PhotoUpload(), cancellationToken).ConfigureAwait(false)).Id;
    }
}
