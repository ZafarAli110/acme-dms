using Acme.Documents.Messaging.RabbitMq;
using RabbitMQ.Client;

namespace Acme.Documents.Messaging.DeadLetters;

/// <summary>
/// Sends the processing messages parked in the dead-letter queue back to their queue, each with its attempts reset, once
/// whatever made them fail is fixed. A person runs it (<c>replay-dead-letters</c>), after reading why they failed.
/// </summary>
public static class DeadLetterReplay
{
    /// <summary>Returns how many messages were sent back.</summary>
    public static async Task<int> ReplayAsync(RabbitMqConnection rabbitMq, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(rabbitMq);
        await using var channel = await rabbitMq.CreateChannelAsync(publisherConfirms: true, cancellationToken);
        var replayed = 0;
        while (await channel.BasicGetAsync(RabbitMqConnection.ProcessDocumentDeadLetterQueue, autoAck: false, cancellationToken) is { } message)
        {
            // A fresh start: no attempts counted, and no record of the dead-lettering.
            var headers = (message.BasicProperties.Headers ?? new Dictionary<string, object?>())
                .Where(header => header.Key is not ("x-attempt" or "x-death"))
                .ToDictionary(header => header.Key, header => header.Value);
            var properties = new BasicProperties(message.BasicProperties) { Headers = headers };
            await channel.BasicPublishAsync(string.Empty, RabbitMqConnection.ProcessDocumentQueue, mandatory: true, properties, message.Body, cancellationToken);
            await channel.BasicAckAsync(message.DeliveryTag, multiple: false, cancellationToken);
            replayed++;
        }

        return replayed;
    }
}
