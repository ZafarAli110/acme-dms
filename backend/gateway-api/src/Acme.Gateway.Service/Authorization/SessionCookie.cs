namespace Acme.Gateway.Service.Authorization;

/// <summary>
/// The browser's session cookie, as HTTP sees it. Its value (made by the business logic) is the only thing the browser holds of
/// its sign-in; the gateway keeps the rest.
/// </summary>
internal static class SessionCookie
{
    /// <summary>
    /// The <c>__Host-</c> prefix: the browser accepts the cookie only when it is <c>Secure</c>, has no <c>Domain</c> and has
    /// <c>Path=/</c>, so a sibling subdomain cannot plant one of its own. The same name, and the same rules, on a
    /// developer's machine as live: the web server there is HTTPS too (ACME-130).
    /// </summary>
    public const string Name = "__Host-acme_session";

    /// <summary>
    /// A page's own request carries this header, which a form or a link from another site cannot add: with
    /// <c>SameSite=Strict</c>, the defence against a request made on the person's behalf (the same one identity-api asks for).
    /// </summary>
    public const string RequiredHeader = "X-Requested-With";
    public const string RequiredHeaderValue = "acme-web";

    /// <summary>The cookie's value, or null when the request has none.</summary>
    public static string? ValueOf(HttpRequest request) =>
        request.Cookies.TryGetValue(Name, out var value) && value.Length > 0 ? value : null;

    public static void Set(HttpResponse response, string value) => response.Cookies.Append(Name, value, Options());

    public static void Clear(HttpResponse response) => response.Cookies.Delete(Name, Options());

    /// <summary>True when the request carries the header only the page itself adds.</summary>
    public static bool IsFromThePage(HttpRequest request) =>
        string.Equals(request.Headers[RequiredHeader], RequiredHeaderValue, StringComparison.Ordinal);

    /// <summary>
    /// Out of reach of the page's scripts (<c>HttpOnly</c>), sent only from this site (<c>SameSite=Strict</c>), and gone when
    /// the browser closes (no expiry: the session's own lifetime is kept by the gateway). <c>Path=/</c>, as <c>__Host-</c>
    /// requires; the gateway reads it only on <c>/api</c>. <c>Secure</c> everywhere, a developer's machine too (ACME-130).
    /// </summary>
    private static CookieOptions Options() => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/",
        IsEssential = true,
    };
}
