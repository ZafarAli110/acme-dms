using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.GetContent;
using Acme.Documents.DTO.Documents;
using Microsoft.EntityFrameworkCore;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;
using Acme.Documents.BusinessLogic.Abstractions.Exceptions;
using Acme.Documents.Persistence.Database;

namespace Acme.Documents.BusinessLogic.Handlers.Documents.GetContent;

internal sealed class GetDocumentContentQueryHandler : IGetDocumentContentQueryHandler
{
    private readonly DocumentsDbContext _dbContext;

    public GetDocumentContentQueryHandler(DocumentsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<DocumentContentDto> ExecuteAsync(UserContext userContext, Guid documentId, string name, CancellationToken cancellationToken)
    {
        // Join through Documents so the dealer filter applies: content of another dealer's document is "not found".
        var content = await _dbContext.Documents
            .Where(d => d.Id == documentId)
            .SelectMany(d => d.Contents)
            .Where(c => c.Name == name)
            .AsNoTracking()
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new ApiException(ApiErrorCategory.NotFound, $"Document {documentId} has no '{name}' content.");

        return new DocumentContentDto(content.Data, content.ContentType);
    }
}
