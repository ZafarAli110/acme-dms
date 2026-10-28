using Microsoft.Extensions.DependencyInjection;
using Acme.Documents.Messaging.Consumers;
using Acme.Documents.Messaging.Publishing;
using Acme.Documents.Messaging.RabbitMq;

namespace Acme.Documents.Messaging;

public static class MessagingServiceCollectionExtensions
{
    public static IServiceCollection AddMessaging(this IServiceCollection services, string rabbitMqConnectionString)
    {
        services.AddSingleton(new RabbitMqConnection(rabbitMqConnectionString));
        services.AddHostedService<OutboxRelay>();
        services.AddHostedService<ProcessDocumentConsumer>();
        return services;
    }
}
