using Acme.Gateway.BusinessLogic.Abstractions.Clients;
using Acme.ServiceDefaults.ProblemDetails;

namespace Acme.Gateway.Service.Sessions;

/// <summary>The gateway's own refusals, in the problem-details shape every service answers with.</summary>
internal static class SessionProblems
{
    public const string NotFromThePage = "This request must come from the app's own pages.";
    public const string Ended = "The sign-in has ended.";
    public const string IdentityUnavailable = "Signing in is unavailable right now. Try again shortly.";

    /// <summary>
    /// Marks the gateway's own "the sign-in has ended" 401: the page ends its sign-in on this one only. A 401 from a service
    /// (a token it refused while the session lives) is an error to show, not a reason to sign the person out.
    /// </summary>
    public const string EndedHeader = "X-Acme-Session";
    public const string EndedHeaderValue = "ended";

    public static Task WriteEndedAsync(HttpContext context)
    {
        context.Response.Headers[EndedHeader] = EndedHeaderValue;
        return WriteAsync(context, StatusCodes.Status401Unauthorized, Ended);
    }

    public static Task WriteAsync(HttpContext context, int status, string detail)
    {
        context.Response.StatusCode = status;
        var problem = ProblemDetailsDtoFactory.CreateWithSafeDetail(context, status, detail);
        return context.Response.WriteAsJsonAsync(problem, (System.Text.Json.JsonSerializerOptions?)null, "application/problem+json", context.RequestAborted);
    }

    /// <summary>Who the gateway acts for when it calls identity-api: the browser's address and language.</summary>
    public static CallerContext CallerOf(HttpContext context) =>
        new(context.Connection.RemoteIpAddress?.ToString(), context.Request.Headers.AcceptLanguage.ToString());
}
