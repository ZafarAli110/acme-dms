using Acme.Identity.BusinessLogic.Abstractions.Handlers.Locations.GetList;
using Acme.Identity.BusinessLogic.Authorization;
using Acme.Identity.DTO.Locations;
using Acme.ServiceDefaults.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.Locations;

/// <summary>The dealer's locations, for the manager's Locations page.</summary>
[Authorize]
public sealed class LocationController : ApiControllerBase
{
    private readonly IGetLocationsQueryHandler _getLocationsQueryHandler;

    public LocationController(IGetLocationsQueryHandler getLocationsQueryHandler)
    {
        _getLocationsQueryHandler = getLocationsQueryHandler;
    }

    [HttpGet("v1/locations")]
    [RequirePermission(Permissions.UsersManage)]
    public async Task<ActionResult<IReadOnlyList<LocationResponseDto>>> GetListAsync(CancellationToken cancellationToken) =>
        Ok(await _getLocationsQueryHandler.ExecuteAsync(CurrentUser, cancellationToken));
}
