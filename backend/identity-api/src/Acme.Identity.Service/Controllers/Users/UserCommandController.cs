using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.AssignLocation;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.UnassignLocation;
using Acme.Identity.BusinessLogic.Authorization;
using Acme.Identity.DTO.Users;
using Acme.ServiceDefaults.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.Users;

/// <summary>A manager assigns users to locations and takes them away. Both answer with the user as it now is.</summary>
[Authorize]
public sealed class UserCommandController : ApiControllerBase
{
    private readonly IAssignUserLocationCommandHandler _assignUserLocationCommandHandler;
    private readonly IUnassignUserLocationCommandHandler _unassignUserLocationCommandHandler;

    public UserCommandController(
        IAssignUserLocationCommandHandler assignUserLocationCommandHandler,
        IUnassignUserLocationCommandHandler unassignUserLocationCommandHandler)
    {
        _assignUserLocationCommandHandler = assignUserLocationCommandHandler;
        _unassignUserLocationCommandHandler = unassignUserLocationCommandHandler;
    }

    [HttpPut("v1/users/{userId:guid}/locations/{locationId:guid}")]
    [RequirePermission(Permissions.UsersManage)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DealerUserResponseDto>> AssignLocationAsync(Guid userId, Guid locationId, CancellationToken cancellationToken) =>
        await _assignUserLocationCommandHandler.ExecuteAsync(CurrentUser, userId, locationId, cancellationToken);

    [HttpDelete("v1/users/{userId:guid}/locations/{locationId:guid}")]
    [RequirePermission(Permissions.UsersManage)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DealerUserResponseDto>> UnassignLocationAsync(Guid userId, Guid locationId, CancellationToken cancellationToken) =>
        await _unassignUserLocationCommandHandler.ExecuteAsync(CurrentUser, userId, locationId, cancellationToken);
}
