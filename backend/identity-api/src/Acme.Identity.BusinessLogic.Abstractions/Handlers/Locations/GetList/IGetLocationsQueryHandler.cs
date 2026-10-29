using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.DTO.Locations;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Locations.GetList;

public interface IGetLocationsQueryHandler
{
    Task<IReadOnlyList<LocationResponseDto>> ExecuteAsync(UserContext userContext, CancellationToken cancellationToken);
}
