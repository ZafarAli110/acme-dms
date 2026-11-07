using Acme.Gateway.BusinessLogic.Abstractions.Clients;
using Acme.Gateway.RestClients.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace Acme.Gateway.RestClients;

public static class RestClientsServiceCollectionExtensions
{
    /// <summary>
    /// The typed clients for other services. Returns identity-api's client builder, for the caller to add service discovery
    /// (the address is a service name, <c>http://identity-api</c>). No retries: a refresh sent twice would look like a copy.
    /// </summary>
    public static IHttpClientBuilder AddRestClients(this IServiceCollection services) =>
        services.AddHttpClient<IIdentityClient, IdentityClient>(client =>
        {
            client.BaseAddress = new Uri("http://identity-api");
            client.Timeout = TimeSpan.FromSeconds(5);
        });
}
