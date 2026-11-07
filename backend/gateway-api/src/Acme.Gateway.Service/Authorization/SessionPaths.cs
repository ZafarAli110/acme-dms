namespace Acme.Gateway.Service.Authorization;

/// <summary>
/// Where the browser's calls go. The gateway's own endpoint sits under <c>/api</c> with the services' routes, so the page
/// calls one origin and one prefix; it has no version because it is the gateway's contract with its own web app, not a
/// service API (<c>docs/contracts.md</c>).
/// </summary>
internal static class SessionPaths
{
    /// <summary>Every call to the services, routed on by YARP.</summary>
    public const string Api = "/api";

    /// <summary>Signing in (POST) and out (DELETE): the gateway's own endpoint.</summary>
    public const string Session = "/api/session";
}
