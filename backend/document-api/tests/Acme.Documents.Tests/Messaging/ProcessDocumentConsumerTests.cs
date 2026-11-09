using System.Text.Json;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Fail;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.ForgetUnclaimed;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Process;
using Acme.Documents.DTO.Messages;
using Acme.Documents.Messaging.Consumers;
using Acme.Documents.Messaging.RabbitMq;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Acme.Documents.Tests.Messaging;

/// <summary>
/// How the consumer settles a processing message whose handler fails (the state sweep's F4): retried through the retry
/// queue while attempts remain; after the last, the document is marked failed, which is final, and the message is
/// acknowledged; only when even that save fails does it go to the dead-letter queue, still Pending, for a replay.
/// </summary>
[TestClass]
public sealed class ProcessDocumentConsumerTests
{
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task AFailedAttempt_WaitsInTheRetryQueue_WithTheNextAttempt_ThenIsAcknowledged()
    {
        var (consumer, _) = Consumer(failSaves: true);
        var channel = Channel();

        await consumer.HandleAsync(channel.Object, Delivery(attempt: 1), TestContext.CancellationToken);

        channel.Verify(c => c.BasicPublishAsync(
            string.Empty,
            RabbitMqConnection.ProcessDocumentRetryQueue,
            It.IsAny<bool>(),
            It.Is<BasicProperties>(p => p.Headers != null && Equals(p.Headers["x-attempt"], 2)),
            It.IsAny<ReadOnlyMemory<byte>>(),
            It.IsAny<CancellationToken>()), Times.Once);
        channel.Verify(c => c.BasicAckAsync(7, false, It.IsAny<CancellationToken>()), Times.Once);
        channel.Verify(c => c.BasicNackAsync(It.IsAny<ulong>(), It.IsAny<bool>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [TestMethod]
    public async Task TheLastAttempt_MarksTheDocumentFailed_AndAcknowledges_NothingForADeadLetterReplay()
    {
        var (consumer, fail) = Consumer(failSaves: true);
        var channel = Channel();

        await consumer.HandleAsync(channel.Object, Delivery(attempt: ProcessDocumentConsumer.MaxAttempts), TestContext.CancellationToken);

        fail.Verify(f => f.ExecuteAsync(It.IsAny<ProcessDocumentMessageDto>(), "cannot read the image", It.IsAny<CancellationToken>()), Times.Once);
        channel.Verify(c => c.BasicAckAsync(7, false, It.IsAny<CancellationToken>()), Times.Once);
        channel.Verify(c => c.BasicNackAsync(It.IsAny<ulong>(), It.IsAny<bool>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [TestMethod]
    public async Task TheLastAttempt_WhenFailedCannotBeSaved_GoesToTheDeadLetterQueue()
    {
        var (consumer, _) = Consumer(failSaves: false);
        var channel = Channel();

        await consumer.HandleAsync(channel.Object, Delivery(attempt: ProcessDocumentConsumer.MaxAttempts), TestContext.CancellationToken);

        channel.Verify(c => c.BasicNackAsync(7, false, false, It.IsAny<CancellationToken>()), Times.Once);
        channel.Verify(c => c.BasicAckAsync(It.IsAny<ulong>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>A consumer whose processing always fails; marking the document failed saves, or throws.</summary>
    private static (ProcessDocumentConsumer Consumer, Mock<IFailDocumentCommandHandler> Fail) Consumer(bool failSaves)
    {
        var process = new Mock<IProcessDocumentCommandHandler>();
        process.Setup(p => p.ExecuteAsync(It.IsAny<ProcessDocumentMessageDto>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("cannot read the image"));
        var fail = new Mock<IFailDocumentCommandHandler>();
        if (!failSaves)
        {
            fail.Setup(f => f.ExecuteAsync(It.IsAny<ProcessDocumentMessageDto>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ThrowsAsync(new InvalidOperationException("database down"));
        }

        var services = new ServiceCollection()
            .AddScoped(_ => process.Object)
            .AddScoped(_ => fail.Object)
            .AddScoped(_ => new Mock<IForgetUnclaimedDocumentCommandHandler>().Object)
            .BuildServiceProvider();
        // Never connected: the channel is the mock each test passes.
        var rabbitMq = new RabbitMqConnection("amqp://guest:guest@localhost:5672");
        return (new ProcessDocumentConsumer(services.GetRequiredService<IServiceScopeFactory>(), rabbitMq, NullLogger<ProcessDocumentConsumer>.Instance), fail);
    }

    private static Mock<IChannel> Channel()
    {
        var channel = new Mock<IChannel>();
        channel.Setup(c => c.BasicPublishAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<bool>(),
                It.IsAny<BasicProperties>(),
                It.IsAny<ReadOnlyMemory<byte>>(),
                It.IsAny<CancellationToken>()))
            .Returns(ValueTask.CompletedTask);
        channel.Setup(c => c.BasicAckAsync(It.IsAny<ulong>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).Returns(ValueTask.CompletedTask);
        channel.Setup(c => c.BasicNackAsync(It.IsAny<ulong>(), It.IsAny<bool>(), It.IsAny<bool>(), It.IsAny<CancellationToken>())).Returns(ValueTask.CompletedTask);
        return channel;
    }

    private static BasicDeliverEventArgs Delivery(int attempt)
    {
        var envelope = new MessageEnvelope<ProcessDocumentMessageDto>(
            Guid.NewGuid(),
            MessageTypes.ProcessDocument,
            DateTimeOffset.UtcNow,
            null,
            new ProcessDocumentMessageDto(Guid.NewGuid(), TestDocuments.Northwind));
        var properties = new BasicProperties { Headers = new Dictionary<string, object?> { ["x-attempt"] = attempt } };
        return new BasicDeliverEventArgs(
            "consumer",
            7,
            false,
            MessageTypes.Exchange,
            MessageTypes.ProcessDocument,
            properties,
            JsonSerializer.SerializeToUtf8Bytes(envelope, _json));
    }
}
