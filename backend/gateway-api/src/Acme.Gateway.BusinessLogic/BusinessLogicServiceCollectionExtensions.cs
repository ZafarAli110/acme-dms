using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Create;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Delete;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.GetAccessToken;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Gateway.BusinessLogic.Handlers.Sessions.Create;
using Acme.Gateway.BusinessLogic.Handlers.Sessions.Delete;
using Acme.Gateway.BusinessLogic.Handlers.Sessions;
using Acme.Gateway.BusinessLogic.Handlers.Sessions.GetAccessToken;
using Acme.Gateway.BusinessLogic.Handlers.System.GetHealth;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Acme.Gateway.BusinessLogic;

public static class BusinessLogicServiceCollectionExtensions
{
    public static IServiceCollection AddBusinessLogic(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.AddScoped<RefreshTokenRevoker>();
        services.AddScoped<ICreateSessionCommandHandler, CreateSessionCommandHandler>();
        services.AddScoped<IDeleteSessionCommandHandler, DeleteSessionCommandHandler>();
        services.AddScoped<IGetAccessTokenCommandHandler, GetAccessTokenCommandHandler>();
        services.AddScoped<IGetHealthQueryHandler, GetHealthQueryHandler>();
        return services;
    }
}
