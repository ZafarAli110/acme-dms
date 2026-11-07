using System.Text;
using System.Text.Json;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Fail;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.ForgetUnclaimed;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Process;
using Acme.Documents.DTO.Messages;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using Acme.Documents.Messaging.RabbitMq;

namespace Acme.Documents.Messaging.Consumers;

/// <summary>
/// Consumes document.process.v1 and hands each message to the business handler. A failed attempt is retried
/// (with a growing delay) up to <see cref="MaxAttempts"/> times; after that the document is marked failed,
/// document.failed.v1 is published, and the message goes to the dead-letter queue for inspection.
/// </summary>
public sealed partial class ProcessDocumentConsumer : BackgroundService
{
    public const int MaxAttempts = 3;
    private const string AttemptHeader = "x-attempt";
    private static readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly RabbitMqConnection _rabbitMq;
    private readonly ILogger<ProcessDocumentConsumer> _logger;
    private IChannel? _channel;

    public ProcessDocumentConsumer(IServiceScopeFactory scopeFactory, RabbitMqConnection rabbitMq, ILogger<ProcessDocumentConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _rabbitMq = rabbitMq;
        _logger = logger;
    }

    public override void Dispose()
    {
        _channel?.Dispose();
        base.Dispose();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Confirmed: a retry is republished before the delivery is acknowledged, so a republish the broker lost must fail
        // here, not leave the document pending for good.
        _channel = await _rabbitMq.CreateChannelAsync(publisherConfirms: true, stoppingToken);
        await _channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 4, global: false, stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(_channel);
        consumer.ReceivedAsync += (_, delivery) => HandleAsync(_channel, delivery, stoppingToken);
        await _channel.BasicConsumeAsync(RabbitMqConnection.ProcessDocumentQueue, autoAck: false, consumer, stoppingToken);

        // Nothing reads the dead-letter queue on its own: while it holds messages, a warning says so once a minute, with the
        // way out (the `replay-dead-letters` command, after reading why they failed).
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            try
            {
                var parked = await _channel.MessageCountAsync(RabbitMqConnection.ProcessDocumentDeadLetterQueue, stoppingToken);
                if (parked > 0)
                {
                    LogDeadLettersParked(_logger, parked);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // The channel is reconnecting: the next minute looks again.
            }
        }
    }

    private async Task HandleAsync(IChannel channel, BasicDeliverEventArgs delivery, CancellationToken cancellationToken)
    {
        MessageEnvelope<ProcessDocumentMessageDto>? envelope;
        try
        {
            envelope = JsonSerializer.Deserialize<MessageEnvelope<ProcessDocumentMessageDto>>(delivery.Body.Span, _jsonOptions);
        }
        catch (JsonException)
        {
            // Never handleable: to the dead-letter queue, not held unacknowledged.
            envelope = null;
        }

        if (envelope is null)
        {
            await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, cancellationToken);
            return;
        }

        if (envelope.Type == MessageTypes.DocumentUnclaimed)
        {
            await ForgetUnclaimedAsync(channel, delivery, envelope.Data, cancellationToken);
            return;
        }

        var attempt = ReadAttempt(delivery.BasicProperties);
        using var scope = _scopeFactory.CreateScope();
        try
        {
            await scope.ServiceProvider.GetRequiredService<IProcessDocumentCommandHandler>().ExecuteAsync(envelope.Data, cancellationToken);
            await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            if (attempt < MaxAttempts)
            {
                LogRetrying(_logger, envelope.Data.DocumentId, attempt, ex);
                await Task.Delay(TimeSpan.FromSeconds(2 * attempt), cancellationToken);
                try
                {
                    await RepublishAsync(channel, delivery, attempt + 1, cancellationToken);
                }
                catch (Exception publishError) when (publishError is not OperationCanceledException)
                {
                    // The broker did not take the retry: give this delivery back to the queue instead of holding it.
                    LogRepublishFailed(_logger, envelope.Data.DocumentId, publishError);
                    await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: true, cancellationToken);
                    return;
                }

                await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken);
                return;
            }

            LogGivingUp(_logger, envelope.Data.DocumentId, attempt, ex);
            try
            {
                // A scope of its own: the one that failed may hold the document as it was before a race.
                using var failScope = _scopeFactory.CreateScope();
                await failScope.ServiceProvider.GetRequiredService<IFailDocumentCommandHandler>().ExecuteAsync(envelope.Data, ex.Message, cancellationToken);
            }
            catch (Exception failError) when (failError is not OperationCanceledException)
            {
                // The message still goes to the dead-letter queue, where it can be read and sent again.
                LogCouldNotMarkFailed(_logger, envelope.Data.DocumentId, failError);
            }

            await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, cancellationToken);
        }
    }

    /// <summary>A document the owning service never claimed: deleted, or dead-lettered when that fails.</summary>
    private async Task ForgetUnclaimedAsync(IChannel channel, BasicDeliverEventArgs delivery, ProcessDocumentMessageDto data, CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            await scope.ServiceProvider.GetRequiredService<IForgetUnclaimedDocumentCommandHandler>().ExecuteAsync(data, cancellationToken);
            await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            LogCouldNotForget(_logger, data.DocumentId, ex);
            await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, cancellationToken);
        }
    }

    private static int ReadAttempt(IReadOnlyBasicProperties properties) =>
        properties.Headers is not null && properties.Headers.TryGetValue(AttemptHeader, out var value) && value is int attempt ? attempt : 1;

    private static async Task RepublishAsync(IChannel channel, BasicDeliverEventArgs delivery, int attempt, CancellationToken cancellationToken)
    {
        var headers = new Dictionary<string, object?>(delivery.BasicProperties.Headers ?? new Dictionary<string, object?>()) { [AttemptHeader] = attempt };
        var properties = new BasicProperties(delivery.BasicProperties) { Headers = headers };
        await channel.BasicPublishAsync(delivery.Exchange, delivery.RoutingKey, mandatory: false, properties, delivery.Body, cancellationToken);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Processing document {DocumentId} failed on attempt {Attempt}; retrying")]
    private static partial void LogRetrying(ILogger logger, Guid documentId, int attempt, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Processing document {DocumentId} failed after {Attempt} attempts; marking it failed")]
    private static partial void LogGivingUp(ILogger logger, Guid documentId, int attempt, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Unclaimed document {DocumentId} could not be deleted; its message goes to the dead-letter queue")]
    private static partial void LogCouldNotForget(ILogger logger, Guid documentId, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Count} processing messages are parked in the dead-letter queue: read why in RabbitMQ's management UI, then run the service with replay-dead-letters")]
    private static partial void LogDeadLettersParked(ILogger logger, uint count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The retry of document {DocumentId} could not be published; its message goes back to the queue")]
    private static partial void LogRepublishFailed(ILogger logger, Guid documentId, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Document {DocumentId} could not be marked failed; its message goes to the dead-letter queue")]
    private static partial void LogCouldNotMarkFailed(ILogger logger, Guid documentId, Exception exception);
}
