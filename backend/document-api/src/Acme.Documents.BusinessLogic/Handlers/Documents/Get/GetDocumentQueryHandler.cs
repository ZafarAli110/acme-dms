using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Get;
using Acme.Documents.DTO.Documents;
using Microsoft.EntityFrameworkCore;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;
using Acme.Documents.BusinessLogic.Abstractions.Exceptions;
using Acme.Documents.Persistence.Database;

namespace Acme.Documents.BusinessLogic.Handlers.Documents.Get;

internal sealed class GetDocumentQueryHandler : IGetDocumentQueryHandler
{
    private readonly DocumentsDbContext _dbContext;

    public GetDocumentQueryHandler(DocumentsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<DocumentResponseDto> ExecuteAsync(UserContext userContext, Guid documentId, CancellationToken cancellationToken)
    {
        // The dealer filter on DocumentsDbContext already limits this to the user's dealer.
        var document = await _dbContext.Documents
            .AsNoTracking()
            .Include(d => d.Contents.Where(c => c.Name != "original"))
            .SingleOrDefaultAsync(d => d.Id == documentId, cancellationToken)
            ?? throw new ApiException(ApiErrorCategory.NotFound, $"Document {documentId} was not found.");

        return DocumentMapper.ToDocumentResponseDto(document);
    }
}
