using Acme.ServiceDefaults.Authorization;
using Microsoft.AspNetCore.Mvc;
using Acme.Documents.BusinessLogic.Abstractions.Authorization;

namespace Acme.Documents.Service.Controllers;

/// <summary>
/// Base of every controller. Handlers throw <see cref="ApiException"/> for expected failures; the
/// <c>ApiExceptionHandler</c> turns those into problem details, so actions only await the handler and return.
/// </summary>
[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    /// <summary>The signed-in user of this request, at their selected location, in the shape the business handlers expect.</summary>
    protected UserContext CurrentUser
    {
        get
        {
            var userContext = HttpContext.GetUserContext();
            return new UserContext(userContext.UserId, userContext.DealerId, userContext.LocationId);
        }
    }
}
