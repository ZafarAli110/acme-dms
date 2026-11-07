using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Gateway.Service.Controllers.Sessions;

/// <summary>identity-api's refusal of a sign-in, unchanged: its status, its body and the headers the page reads.</summary>
internal sealed class IdentityRefusalResult(IdentityRefusal refusal) : ActionResult
{
    public override async Task ExecuteResultAsync(ActionContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        var response = context.HttpContext.Response;
        response.StatusCode = refusal.Status;
        response.ContentType = refusal.ContentType ?? "application/problem+json";
        if (refusal.RetryAfter is { } retryAfter)
        {
            response.Headers.RetryAfter = retryAfter;
        }

        await response.Body.WriteAsync(refusal.Body, context.HttpContext.RequestAborted);
    }
}
