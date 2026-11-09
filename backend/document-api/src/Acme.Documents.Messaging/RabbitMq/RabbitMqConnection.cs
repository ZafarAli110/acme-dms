using Acme.Documents.DTO.Messages;
using RabbitMQ.Client;

namespace Acme.Documents.Messaging.RabbitMq;

/// <summary>One RabbitMQ connection per process, created on first use, with the topology document-api relies on.</summary>
public sealed class RabbitMqConnection : IAsyncDisposable
{
    public const string ProcessDocumentQueue = "document-api.process-document";
    public const string DeadLetterExchange = "acme.documents.dlx";
    public const string ProcessDocumentDeadLetterQueue = "document-api.process-document.dlq";

    /// <summary>A failed attempt waits here <see cref="RetryDelay"/>, then goes back to <see cref="ProcessDocumentQueue"/>.</summary>
    public const string ProcessDocumentRetryQueue = "document-api.process-document.retry";

    /// <summary>How long a failed attempt waits before the next: room for a passing outage, without holding a consumer.</summary>
    public static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(10);

    private readonly ConnectionFactory _factory;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private IConnection? _connection;

    public RabbitMqConnection(string connectionString)
    {
        _factory = new ConnectionFactory { Uri = new Uri(connectionString), ClientProvidedName = "document-api" };
    }

    public async Task<IChannel> CreateChannelAsync(bool publisherConfirms, CancellationToken cancellationToken)
    {
        var connection = await GetConnectionAsync(cancellationToken);
        var options = new CreateChannelOptions(publisherConfirmationsEnabled: publisherConfirms, publisherConfirmationTrackingEnabled: publisherConfirms);
        return await connection.CreateChannelAsync(options, cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (_connection is not null)
        {
            await _connection.DisposeAsync();
        }

        _lock.Dispose();
    }

    private async Task<IConnection> GetConnectionAsync(CancellationToken cancellationToken)
    {
        if (_connection is { IsOpen: true })
        {
            return _connection;
        }

        await _lock.WaitAsync(cancellationToken);
        try
        {
            if (_connection is not { IsOpen: true })
            {
                _connection = await _factory.CreateConnectionAsync(cancellationToken);
                await DeclareTopologyAsync(_connection, cancellationToken);
            }

            return _connection;
        }
        finally
        {
            _lock.Release();
        }
    }

    private static async Task DeclareTopologyAsync(IConnection connection, CancellationToken cancellationToken)
    {
        await using var channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);
        await channel.ExchangeDeclareAsync(MessageTypes.Exchange, ExchangeType.Topic, durable: true, cancellationToken: cancellationToken);
        await channel.ExchangeDeclareAsync(DeadLetterExchange, ExchangeType.Topic, durable: true, cancellationToken: cancellationToken);

        await channel.QueueDeclareAsync(ProcessDocumentDeadLetterQueue, durable: true, exclusive: false, autoDelete: false, cancellationToken: cancellationToken);
        await channel.QueueBindAsync(ProcessDocumentDeadLetterQueue, DeadLetterExchange, MessageTypes.ProcessDocument, cancellationToken: cancellationToken);
        await channel.QueueBindAsync(ProcessDocumentDeadLetterQueue, DeadLetterExchange, MessageTypes.DocumentUnclaimed, cancellationToken: cancellationToken);
        // A message that came back from the retry queue or a replay carries the queue's own name as its routing key: without
        // this binding the dead-letter exchange had nowhere to put it, and RabbitMQ dropped it (the state sweep's F3).
        await channel.QueueBindAsync(ProcessDocumentDeadLetterQueue, DeadLetterExchange, ProcessDocumentQueue, cancellationToken: cancellationToken);

        // Waits out RetryDelay, then expires back to the work queue through the default exchange (dealership-api's pattern).
        var retryArguments = new Dictionary<string, object?>
        {
            ["x-message-ttl"] = (int)RetryDelay.TotalMilliseconds,
            ["x-dead-letter-exchange"] = string.Empty,
            ["x-dead-letter-routing-key"] = ProcessDocumentQueue,
        };
        await channel.QueueDeclareAsync(ProcessDocumentRetryQueue, durable: true, exclusive: false, autoDelete: false, arguments: retryArguments, cancellationToken: cancellationToken);

        var arguments = new Dictionary<string, object?> { ["x-dead-letter-exchange"] = DeadLetterExchange };
        await channel.QueueDeclareAsync(ProcessDocumentQueue, durable: true, exclusive: false, autoDelete: false, arguments: arguments, cancellationToken: cancellationToken);
        await channel.QueueBindAsync(ProcessDocumentQueue, MessageTypes.Exchange, MessageTypes.ProcessDocument, cancellationToken: cancellationToken);
        // The same queue takes dealership-api's word that a document is nobody's: the consumer deletes it.
        await channel.QueueBindAsync(ProcessDocumentQueue, MessageTypes.Exchange, MessageTypes.DocumentUnclaimed, cancellationToken: cancellationToken);
    }
}
