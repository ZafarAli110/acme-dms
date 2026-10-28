namespace Acme.Documents.DTO.Documents;

public sealed record DocumentContentDto(ReadOnlyMemory<byte> Data, string ContentType);
