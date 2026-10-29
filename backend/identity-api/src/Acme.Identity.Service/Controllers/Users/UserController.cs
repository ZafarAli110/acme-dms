using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetCurrent;
using Acme.Identity.DTO.Users;
using Acme.ServiceDefaults.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.Users;

[Authorize]
public sealed class UserController : ApiControllerBase
{
    private readonly IGetCurrentUserQueryHandler _getCurrentUserQueryHandler;

    public UserController(IGetCurrentUserQueryHandler getCurrentUserQueryHandler)
    {
        _getCurrentUserQueryHandler = getCurrentUserQueryHandler;
    }

    [HttpGet("v1/users/me")]
    public async Task<ActionResult<CurrentUserResponseDto>> GetCurrentAsync(CancellationToken cancellationToken) =>
        await _getCurrentUserQueryHandler.ExecuteAsync(User.GetUserId(), cancellationToken);
}
