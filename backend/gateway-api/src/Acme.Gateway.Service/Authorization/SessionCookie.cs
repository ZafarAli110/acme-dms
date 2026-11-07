namespace Acme.Gateway.Service.Authorization;

/// <summary>
/// The browser's session cookie, as HTTP sees it. Its value (made by the business logic) is the only thing the browser holds of
/// its sign-in; the gateway keeps the rest.
/// </summary>
internal static class SessionCookie
{
    public const string Name = "acme_session";

    /// <summary>Sent with every call to the services, and only there: the page itself is not behind it.</summary>
    public const string Path = "/api";

    /// <summary>
    /// A page's own request carries this header, which a form or a link from another site cannot add: with
    /// <c>SameSite=Strict</c>, the defence against a request made on the person's behalf (the same one identity-api asks for).
    /// </summary>
    public const string RequiredHeader = "X-Requested-With";
    public const string RequiredHeaderValue = "acme-web";

    /// <summary>The cookie's value, or null when the request has none.</summary>
    public static string? ValueOf(HttpRequest request) =>
        request.Cookies.TryGetValue(Name, out var value) && value.Length > 0 ? value : null;

    public static void Set(HttpResponse response, IHostEnvironment environment, string value) =>
        response.Cookies.Append(Name, value, Options(environment));

    public static void Clear(HttpResponse response, IHostEnvironment environment) =>
        response.Cookies.Delete(Name, Options(environment));

    /// <summary>True when the request carries the header only the page itself adds.</summary>
    public static bool IsFromThePage(HttpRequest request) =>
        string.Equals(request.Headers[RequiredHeader], RequiredHeaderValue, StringComparison.Ordinal);

    /// <summary>
    /// Out of reach of the page's scripts (<c>HttpOnly</c>), sent only from this site (<c>SameSite=Strict</c>) and only to
    /// <c>/api</c>, and gone when the browser closes (no expiry: the session's own lifetime is kept by the gateway).
    /// <c>Secure</c> everywhere but local development, which is plain HTTP.
    /// </summary>
    private static CookieOptions Options(IHostEnvironment environment) => new()
    {
        HttpOnly = true,
        Secure = !environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        Path = Path,
        IsEssential = true,
    };
}
