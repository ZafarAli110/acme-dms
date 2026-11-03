# An endpoint in identity-api or document-api (.NET, EF Core)

The same steps as dealership-api, in the .NET shape. The example is document-api's `GetDocumentQueryHandler`
(`src/Acme.Documents.BusinessLogic/Handlers/Documents/Get/`) and its test
(`tests/Acme.Documents.Tests/Handlers/Documents/GetDocumentQueryHandlerTests.cs`).

## Whose data it is

The `DbContext` filters by dealer for you: `HasQueryFilter(d => d.DealerId == _dealerId && !d.IsDeleted)` in
`DocumentsDbContext`, with the dealer from the request's scope. A new entity that belongs to a dealer gets the same
filter in `OnModelCreating`. Only background work with no signed-in user calls `IgnoreQueryFilters()`, and then
filters by hand.

## The handler

```csharp
internal sealed class GetDocumentQueryHandler : IGetDocumentQueryHandler
{
    private readonly DocumentsDbContext _dbContext;

    public GetDocumentQueryHandler(DocumentsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<DocumentResponseDto> ExecuteAsync(UserContext userContext, Guid documentId, CancellationToken cancellationToken)
    {
        var document = await _dbContext.Documents
            .AsNoTracking()                       // a read changes nothing
            .Include(d => d.Contents.Where(c => c.Name != "original"))
            .SingleOrDefaultAsync(d => d.Id == documentId, cancellationToken)
            ?? throw new ApiException(ApiErrorCategory.NotFound, $"Document {documentId} was not found.");

        return DocumentMapper.ToDocumentResponseDto(document);
    }
}
```

- `internal sealed`, an interface in `BusinessLogic.Abstractions`, explicit backing fields (no primary constructors).
- Every method that waits is `…Async` and takes the `CancellationToken`.
- Time from `TimeProvider.GetUtcNow()`, never `DateTime.Now`.
- Related rows with `.Include(…)` or a `.Select(…)` projection, never a query per row; everything before
  `ToListAsync()` must translate to SQL.
- Expected failures: `ApiException(ApiErrorCategory.NotFound | Conflict | …, "…")`, turned into problem details by
  `ApiExceptionHandler`.

## The controller

```csharp
[HttpGet("v1/documents/{documentId:guid}")]
[RequirePermission("documents.read")]
```

Every action has `[RequirePermission(…)]`; the controller derives from `ApiControllerBase`.

## The test

MSTest, in `tests/…Tests/Handlers/<Area>/`, on `TestDatabase` (`Fakes/`): one in-memory database shared by contexts
with different dealer scopes, so a test can save as one dealer and read as another. Test the dealer boundary, as
`ExecuteAsync_DoesNotReturnAnotherDealersDocument` does: another dealer's id is `NotFound`.

## A schema change

An EF Core migration in the Persistence project: `dotnet ef migrations add <Name>`. Read what it generates; never edit
one that is committed. The service applies its migrations when it starts.
