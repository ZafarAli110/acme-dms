using Acme.Identity.BusinessLogic.Abstractions.Handlers.Locations.GetList;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.AssignLocation;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetCurrent;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetList;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.UnassignLocation;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.WellKnown.GetJsonWebKeySet;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Handlers.Locations.GetList;
using Acme.Identity.BusinessLogic.Handlers.System.GetHealth;
using Acme.Identity.BusinessLogic.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Handlers.Users.AssignLocation;
using Acme.Identity.BusinessLogic.Handlers.Users.GetCurrent;
using Acme.Identity.BusinessLogic.Handlers.Users.GetList;
using Acme.Identity.BusinessLogic.Handlers.Users.UnassignLocation;
using Acme.Identity.BusinessLogic.Handlers.WellKnown.GetJsonWebKeySet;
using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.BusinessLogic.Signing;
using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace Acme.Identity.BusinessLogic;

/// <summary>Registers every business handler. Add one line per new handler.</summary>
public static class BusinessLogicServiceCollectionExtensions
{
    public static IServiceCollection AddBusinessLogic(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddSingleton<ISigningKeyProvider, SigningKeyProvider>();
        services.AddScoped<IdentitySeeder>();

        services.AddScoped<IGetHealthQueryHandler, GetHealthQueryHandler>();
        services.AddScoped<ICreateTokenCommandHandler, CreateTokenCommandHandler>();
        services.AddScoped<IGetCurrentUserQueryHandler, GetCurrentUserQueryHandler>();
        services.AddScoped<IGetJsonWebKeySetQueryHandler, GetJsonWebKeySetQueryHandler>();
        services.AddScoped<IGetUsersQueryHandler, GetUsersQueryHandler>();
        services.AddScoped<IAssignUserLocationCommandHandler, AssignUserLocationCommandHandler>();
        services.AddScoped<IUnassignUserLocationCommandHandler, UnassignUserLocationCommandHandler>();
        services.AddScoped<IGetLocationsQueryHandler, GetLocationsQueryHandler>();
        return services;
    }
}
