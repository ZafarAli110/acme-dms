using Acme.ServiceDefaults.Middleware;
using Acme.ServiceDefaults.ProblemDetails;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Acme.ServiceDefaults.Authorization;

/// <summary>
/// The permission the user must hold at the location selected in <c>x-location-id</c>.
/// Check permissions, never role names: roles change, permissions are the contract.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false)]
public sealed class RequirePermissionAttribute : Attribute, IAuthorizationFilter
{
    public RequirePermissionAttribute(string permission)
    {
        Permission = permission;
    }

    public string Permission { get; }

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var userContext = context.HttpContext.FindUserContext();
        if (userContext is null)
        {
            return;
        }

        if (userContext.LocationId is null)
        {
            context.Result = Problem(context.HttpContext, StatusCodes.Status400BadRequest, $"The {UserContextMiddleware.LocationHeader} header is required for this endpoint.");
        }
        else if (!userContext.HasPermission(Permission))
        {
            context.Result = Problem(context.HttpContext, StatusCodes.Status403Forbidden, $"You do not have the '{Permission}' permission at this location.");
        }
    }

    private static ObjectResult Problem(HttpContext httpContext, int status, string detail) =>
        new(ProblemDetailsDtoFactory.Create(httpContext, status, detail))
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
}
