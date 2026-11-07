using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Acme.Documents.DTO.Messages;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;
using Acme.Documents.Messaging.RabbitMq;
using Acme.Documents.Persistence.Database;

namespace Acme.Documents.Messaging.Publishing;

/// <summary>
/// Publishes outbox messages to RabbitMQ in the order they were written, and marks them published only once the
/// broker has confirmed them. If publishing fails, the messages stay in the outbox and are retried.
/// </summary>
public sealed partial class OutboxRelay : BackgroundService
{
    private static readonly ActivitySource _activitySource = new("Acme.Documents.Messaging");
    private static readonly TimeSpan _pollInterval = TimeSpan.FromSeconds(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly RabbitMqConnection _rabbitMq;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<OutboxRelay> _logger;

    public OutboxRelay(IServiceScopeFactory scopeFactory, RabbitMqConnection rabbitMq, TimeProvider timeProvider, ILogger<OutboxRelay> logger)
    {
        _scopeFactory = scopeFactory;
        _rabbitMq = rabbitMq;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PublishPendingAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogPublishFailed(_logger, ex);
            }

            await Task.Delay(_pollInterval, _timeProvider, stoppingToken);
        }
    }

    private async Task PublishPendingAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<DocumentsDbContext>();
        var pending = await dbContext.OutboxMessages
            .Where(m => m.PublishedAt == null)
            .OrderBy(m => m.OccurredAt)
            .Take(50)
            .ToListAsync(cancellationToken);

        if (pending.Count == 0)
        {
            return;
        }

        await using var channel = await _rabbitMq.CreateChannelAsync(publisherConfirms: true, cancellationToken);
        foreach (var message in pending)
        {
            // Continue the trace of the request that wrote the message, so the dashboard shows one trace end to end.
            ActivityContext.TryParse(message.TraceParent, null, out var parent);
            using var activity = _activitySource.StartActivity($"publish {message.Type}", ActivityKind.Producer, parent);

            JsonObject envelope;
            try
            {
                envelope = new JsonObject
                {
                    ["messageId"] = message.Id,
                    ["type"] = message.Type,
                    ["occurredAt"] = message.OccurredAt,
                    ["correlationId"] = parent.TraceId.ToString(),
                    ["data"] = JsonNode.Parse(message.Payload),
                };
            }
            catch (JsonException ex)
            {
                // A row that can never be sent must not hold up the ones behind it.
                LogUnpublishable(_logger, message.Id, ex);
                continue;
            }

            var properties = new BasicProperties
            {
                MessageId = message.Id.ToString(),
                Type = message.Type,
                ContentType = "application/json",
                Persistent = true,
            };

            await channel.BasicPublishAsync(MessageTypes.Exchange, message.Type, mandatory: false, properties, Encoding.UTF8.GetBytes(envelope.ToJsonString()), cancellationToken);
            // Saved as soon as the broker confirmed it: a failure later in the batch never sends this one again.
            message.PublishedAt = _timeProvider.GetUtcNow();
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Publishing outbox messages failed; they will be retried")]
    private static partial void LogPublishFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Outbox message {MessageId} is not valid JSON and cannot be sent; the messages after it go on")]
    private static partial void LogUnpublishable(ILogger logger, Guid messageId, Exception exception);
}
