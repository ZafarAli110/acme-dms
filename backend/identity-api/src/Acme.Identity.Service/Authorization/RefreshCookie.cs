namespace Acme.Identity.Service.Authorization;

/// <summary>
/// The refresh token's cookie: out of reach of the page's scripts (<c>HttpOnly</c>), sent only to the token endpoints
/// (<c>Path</c>) and only from this site (<c>SameSite=Strict</c>), and gone when the browser closes (no expiry: the
/// sign-in's own lifetime is kept by identity-api). <c>Secure</c> everywhere, a developer's machine too (ACME-130).
/// The path is the one the browser sees, through the gateway's <c>/api/identity</c> prefix.
/// </summary>
internal static class RefreshCookie
{
    public const string Name = "acme_refresh";
    public const string Path = "/api/identity/v1/tokens";

    /// <summary>
    /// A page's own request carries this header, which a form or a link from another site cannot add: another defence
    /// against a request made on the person's behalf, beside <c>SameSite=Strict</c>.
    /// </summary>
    public const string RequiredHeader = "X-Requested-With";
    public const string RequiredHeaderValue = "acme-web";

    public static void Set(HttpResponse response, string refreshToken) =>
        response.Cookies.Append(Name, refreshToken, Options());

    public static void Clear(HttpResponse response) => response.Cookies.Delete(Name, Options());

    private static CookieOptions Options() => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = Path,
        IsEssential = true,
    };
}
