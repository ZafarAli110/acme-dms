namespace Acme.Documents.Persistence.Entities;

/// <summary>
/// A message waiting to be published to RabbitMQ. Written in the same transaction as the change it describes, then
/// published by the outbox relay, so a message is never lost and never sent for a change that rolled back.
/// </summary>
public sealed class OutboxMessage
{
    public Guid Id { get; set; }

    public string Type { get; set; } = string.Empty;

    public string Payload { get; set; } = string.Empty;

    /// <summary>W3C trace context of the request that produced the message, so the trace continues after publishing.</summary>
    public string? TraceParent { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    public DateTimeOffset? PublishedAt { get; set; }
}
