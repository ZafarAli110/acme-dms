using System.Text;
using System.Text.Json;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Fail;
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
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

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
        _channel = await _rabbitMq.CreateChannelAsync(publisherConfirms: false, stoppingToken).ConfigureAwait(false);
        await _channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 4, global: false, stoppingToken).ConfigureAwait(false);

        var consumer = new AsyncEventingBasicConsumer(_channel);
        consumer.ReceivedAsync += (_, delivery) => HandleAsync(_channel, delivery, stoppingToken);
        await _channel.BasicConsumeAsync(RabbitMqConnection.ProcessDocumentQueue, autoAck: false, consumer, stoppingToken).ConfigureAwait(false);

        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(false);
    }

    private async Task HandleAsync(IChannel channel, BasicDeliverEventArgs delivery, CancellationToken cancellationToken)
    {
        var envelope = JsonSerializer.Deserialize<MessageEnvelope<ProcessDocumentMessageDto>>(delivery.Body.Span, JsonOptions);
        if (envelope is null)
        {
            await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, cancellationToken).ConfigureAwait(false);
            return;
        }

        var attempt = ReadAttempt(delivery.BasicProperties);
        using var scope = _scopeFactory.CreateScope();
        try
        {
            await scope.ServiceProvider.GetRequiredService<IProcessDocumentCommandHandler>().ExecuteAsync(envelope.Data, cancellationToken).ConfigureAwait(false);
            await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            if (attempt < MaxAttempts)
            {
                LogRetrying(_logger, envelope.Data.DocumentId, attempt, ex);
                await Task.Delay(TimeSpan.FromSeconds(2 * attempt), cancellationToken).ConfigureAwait(false);
                await RepublishAsync(channel, delivery, attempt + 1, cancellationToken).ConfigureAwait(false);
                await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken).ConfigureAwait(false);
                return;
            }

            LogGivingUp(_logger, envelope.Data.DocumentId, attempt, ex);
            await scope.ServiceProvider.GetRequiredService<IFailDocumentCommandHandler>().ExecuteAsync(envelope.Data, ex.Message, cancellationToken).ConfigureAwait(false);
            await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, cancellationToken).ConfigureAwait(false);
        }
    }

    private static int ReadAttempt(IReadOnlyBasicProperties properties) =>
        properties.Headers is not null && properties.Headers.TryGetValue(AttemptHeader, out var value) && value is int attempt ? attempt : 1;

    private static async Task RepublishAsync(IChannel channel, BasicDeliverEventArgs delivery, int attempt, CancellationToken cancellationToken)
    {
        var headers = new Dictionary<string, object?>(delivery.BasicProperties.Headers ?? new Dictionary<string, object?>()) { [AttemptHeader] = attempt };
        var properties = new BasicProperties(delivery.BasicProperties) { Headers = headers };
        await channel.BasicPublishAsync(delivery.Exchange, delivery.RoutingKey, mandatory: false, properties, delivery.Body, cancellationToken).ConfigureAwait(false);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Processing document {DocumentId} failed on attempt {Attempt}; retrying")]
    private static partial void LogRetrying(ILogger logger, Guid documentId, int attempt, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Processing document {DocumentId} failed after {Attempt} attempts; marking it failed")]
    private static partial void LogGivingUp(ILogger logger, Guid documentId, int attempt, Exception exception);
}
