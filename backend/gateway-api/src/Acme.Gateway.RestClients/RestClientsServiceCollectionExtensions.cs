using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.RestClients.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace Acme.Gateway.RestClients;

public static class RestClientsServiceCollectionExtensions
{
    /// <summary>
    /// The typed clients for other services. Returns identity-api's client builder, for the caller to add service discovery
    /// (the address is a service name, <c>http://identity-api</c>). No retries: a refresh sent twice would look like a copy.
    /// The timeout is the longest any call may take; a renewal sets its own, shorter one.
    /// </summary>
    public static IHttpClientBuilder AddRestClients(this IServiceCollection services) =>
        services.AddHttpClient<IIdentityClient, IdentityClient>(client =>
        {
            client.BaseAddress = new Uri("http://identity-api");
            client.Timeout = TimeSpan.FromSeconds(15);
        });
}
