using Microsoft.AspNetCore.Mvc;

namespace Acme.Identity.Service.Controllers;

/// <summary>
/// Base of every controller. Handlers throw <see cref="ApiException"/> for expected failures; the
/// <c>ApiExceptionHandler</c> turns those into problem details, so actions only await the handler and return.
/// </summary>
[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
}
