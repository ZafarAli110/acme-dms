using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetCurrent;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetList;
using Acme.Identity.BusinessLogic.Authorization;
using Acme.Identity.DTO.Users;
using Acme.ServiceDefaults.Authentication;
using Acme.ServiceDefaults.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.Users;

/// <summary>Reads of users. Location assignments are in <see cref="UserCommandController"/>.</summary>
[Authorize]
public sealed class UserController : ApiControllerBase
{
    private readonly IGetCurrentUserQueryHandler _getCurrentUserQueryHandler;
    private readonly IGetUsersQueryHandler _getUsersQueryHandler;

    public UserController(IGetCurrentUserQueryHandler getCurrentUserQueryHandler, IGetUsersQueryHandler getUsersQueryHandler)
    {
        _getCurrentUserQueryHandler = getCurrentUserQueryHandler;
        _getUsersQueryHandler = getUsersQueryHandler;
    }

    [HttpGet("v1/users/me")]
    public async Task<ActionResult<CurrentUserResponseDto>> GetCurrentAsync(CancellationToken cancellationToken) =>
        await _getCurrentUserQueryHandler.ExecuteAsync(User.GetUserId(), cancellationToken);

    /// <summary>Everyone at the dealer and the locations they work at.</summary>
    [HttpGet("v1/users")]
    [RequirePermission(Permissions.UsersManage)]
    public async Task<ActionResult<IReadOnlyList<DealerUserResponseDto>>> GetListAsync(CancellationToken cancellationToken) =>
        Ok(await _getUsersQueryHandler.ExecuteAsync(CurrentUser, cancellationToken));
}
