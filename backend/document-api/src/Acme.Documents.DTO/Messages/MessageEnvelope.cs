namespace Acme.Documents.DTO.Messages;

/// <summary>
/// The JSON envelope every Acme message uses on RabbitMQ (see contracts/README.md). Plain JSON, so the TypeScript
/// and .NET services read each other's messages without a shared library.
/// </summary>
public sealed record MessageEnvelope<TData>(Guid MessageId, string Type, DateTimeOffset OccurredAt, string? CorrelationId, TData Data);
