using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers.Sessions;

public sealed class SessionController : ApiControllerBase
{
    /// <summary>
    /// 204 while the access token's sign-in is open. A token whose sign-in was ended never gets here: the token check
    /// refuses it with 401, which is how the other services learn it (ISessionStatusChecker).
    /// </summary>
    [HttpGet("v1/sessions/current")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult Current() => NoContent();
}
