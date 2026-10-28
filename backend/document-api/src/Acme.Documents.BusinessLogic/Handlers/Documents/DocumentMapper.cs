using Acme.Documents.DTO.Documents;
using Acme.Documents.Persistence.Entities;

namespace Acme.Documents.BusinessLogic.Handlers.Documents;

internal static class DocumentMapper
{
    public static DocumentResponseDto ToDocumentResponseDto(Document document) =>
        new(
            document.Id,
            document.OwnerType,
            document.OwnerId,
            document.OriginalFileName,
            document.ContentType,
            document.SizeBytes,
            document.Status.ToString(),
            document.FailureReason,
            ToVariantDtos(document.Contents),
            document.CreatedAt);

    public static List<DocumentVariantDto> ToVariantDtos(IEnumerable<DocumentContent> contents) =>
        contents
            .Where(c => c.Name != DocumentContent.Original)
            .OrderBy(c => c.Name, StringComparer.Ordinal)
            .Select(c => new DocumentVariantDto(c.Name, c.ContentType, c.Width, c.Height, c.SizeBytes))
            .ToList();
}
