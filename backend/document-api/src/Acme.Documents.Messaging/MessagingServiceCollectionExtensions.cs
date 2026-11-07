using Microsoft.Extensions.DependencyInjection;
using Acme.Documents.Messaging.Consumers;
using Acme.Documents.Messaging.Publishing;
using Acme.Documents.Messaging.RabbitMq;
using Acme.Documents.Messaging.Sweeping;

namespace Acme.Documents.Messaging;

public static class MessagingServiceCollectionExtensions
{
    public static IServiceCollection AddMessaging(this IServiceCollection services, string rabbitMqConnectionString)
    {
        services.AddSingleton(new RabbitMqConnection(rabbitMqConnectionString));
        services.AddHostedService<OutboxRelay>();
        services.AddHostedService<ProcessDocumentConsumer>();
        services.AddHostedService<DocumentSweeper>();
        return services;
    }
}
