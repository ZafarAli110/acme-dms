using Acme.Documents.DTO.Messages;
using RabbitMQ.Client;

namespace Acme.Documents.Messaging.RabbitMq;

/// <summary>One RabbitMQ connection per process, created on first use, with the topology document-api relies on.</summary>
public sealed class RabbitMqConnection : IAsyncDisposable
{
    public const string ProcessDocumentQueue = "document-api.process-document";
    public const string DeadLetterExchange = "acme.documents.dlx";
    public const string ProcessDocumentDeadLetterQueue = "document-api.process-document.dlq";

    private readonly ConnectionFactory _factory;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private IConnection? _connection;

    public RabbitMqConnection(string connectionString)
    {
        _factory = new ConnectionFactory { Uri = new Uri(connectionString), ClientProvidedName = "document-api" };
    }

    public async Task<IChannel> CreateChannelAsync(bool publisherConfirms, CancellationToken cancellationToken)
    {
        var connection = await GetConnectionAsync(cancellationToken).ConfigureAwait(false);
        var options = new CreateChannelOptions(publisherConfirmationsEnabled: publisherConfirms, publisherConfirmationTrackingEnabled: publisherConfirms);
        return await connection.CreateChannelAsync(options, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync()
    {
        if (_connection is not null)
        {
            await _connection.DisposeAsync().ConfigureAwait(false);
        }

        _lock.Dispose();
    }

    private async Task<IConnection> GetConnectionAsync(CancellationToken cancellationToken)
    {
        if (_connection is { IsOpen: true })
        {
            return _connection;
        }

        await _lock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_connection is not { IsOpen: true })
            {
                _connection = await _factory.CreateConnectionAsync(cancellationToken).ConfigureAwait(false);
                await DeclareTopologyAsync(_connection, cancellationToken).ConfigureAwait(false);
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
        await using var channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
        await channel.ExchangeDeclareAsync(MessageTypes.Exchange, ExchangeType.Topic, durable: true, cancellationToken: cancellationToken).ConfigureAwait(false);
        await channel.ExchangeDeclareAsync(DeadLetterExchange, ExchangeType.Topic, durable: true, cancellationToken: cancellationToken).ConfigureAwait(false);

        await channel.QueueDeclareAsync(ProcessDocumentDeadLetterQueue, durable: true, exclusive: false, autoDelete: false, cancellationToken: cancellationToken).ConfigureAwait(false);
        await channel.QueueBindAsync(ProcessDocumentDeadLetterQueue, DeadLetterExchange, MessageTypes.ProcessDocument, cancellationToken: cancellationToken).ConfigureAwait(false);

        var arguments = new Dictionary<string, object?> { ["x-dead-letter-exchange"] = DeadLetterExchange };
        await channel.QueueDeclareAsync(ProcessDocumentQueue, durable: true, exclusive: false, autoDelete: false, arguments: arguments, cancellationToken: cancellationToken).ConfigureAwait(false);
        await channel.QueueBindAsync(ProcessDocumentQueue, MessageTypes.Exchange, MessageTypes.ProcessDocument, cancellationToken: cancellationToken).ConfigureAwait(false);
    }
}
