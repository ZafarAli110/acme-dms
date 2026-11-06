using System.Net;
using System.Net.Http.Json;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Acme.Gateway.Sessions;

/// <summary>What identity-api issued at a sign-in or a refresh.</summary>
internal sealed record IssuedTokens(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAt, Guid UserId);

/// <summary>A sign-in identity-api accepted (<see cref="Tokens"/>), or its refusal, to pass to the browser as it is.</summary>
internal sealed record SignInResult(IssuedTokens? Tokens, HttpResponseMessage? Refusal);

/// <summary>
/// The gateway's calls to identity-api's token endpoints, made for a browser: the same endpoints a script uses, with the
/// browser's address forwarded (<c>X-Forwarded-For</c>), so identity-api's limits count each person and not the gateway.
/// identity-api answers with the refresh token in a cookie; here it is read from <c>Set-Cookie</c> and kept in the session.
/// </summary>
internal sealed class IdentityClient
{
    private const string RefreshCookieName = "acme_refresh";
    private const string AccessTokenField = "accessToken";

    private readonly HttpClient _httpClient;
    private readonly TimeProvider _timeProvider;

    public IdentityClient(HttpClient httpClient, TimeProvider timeProvider)
    {
        _httpClient = httpClient;
        _timeProvider = timeProvider;
    }

    /// <summary>Checks the password. The refusal (401, 429 with <c>Retry-After</c>, 400) is the caller's to pass on and dispose.</summary>
    public async Task<SignInResult> SignInAsync(string email, string password, HttpContext browser, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("/v1/tokens", UriKind.Relative))
        {
            Content = JsonContent.Create(new { email, password }),
        };
        ForwardBrowser(request, browser);
        var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new SignInResult(null, response);
        }

        using (response)
        {
            var refreshToken = RefreshTokenIn(response)
                ?? throw new InvalidOperationException("identity-api signed someone in without a refresh token.");
            return new SignInResult(await IssuedAsync(response, refreshToken, cancellationToken), null);
        }
    }

    /// <summary>
    /// A new access token for the session's refresh token. Null when identity-api refused it (the sign-in ended there, or ran
    /// out); throws when identity-api cannot be reached. Inside identity-api's grace period a replay gets an access token and no
    /// new refresh token: the one the session has is kept.
    /// </summary>
    public async Task<IssuedTokens?> RefreshAsync(string refreshToken, HttpContext browser, CancellationToken cancellationToken)
    {
        using var request = TokenRequest("/v1/tokens/refresh", refreshToken, browser);
        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await IssuedAsync(response, RefreshTokenIn(response) ?? refreshToken, cancellationToken);
    }

    /// <summary>Ends the sign-in at identity-api (the whole refresh-token chain). Best effort: the session is already gone.</summary>
    public async Task RevokeAsync(string refreshToken, HttpContext browser, CancellationToken cancellationToken)
    {
        using var request = TokenRequest("/v1/tokens/revoke", refreshToken, browser);
        using var response = await _httpClient.SendAsync(request, cancellationToken);
    }

    private static HttpRequestMessage TokenRequest(string path, string refreshToken, HttpContext browser)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, new Uri(path, UriKind.Relative));
        request.Headers.Add("Cookie", $"{RefreshCookieName}={refreshToken}");
        request.Headers.Add(SessionCookie.RequiredHeader, SessionCookie.RequiredHeaderValue);
        ForwardBrowser(request, browser);
        return request;
    }

    /// <summary>The browser's address (identity-api trusts one hop: this one) and its language, for identity-api's messages.</summary>
    private static void ForwardBrowser(HttpRequestMessage request, HttpContext browser)
    {
        var address = browser.Connection.RemoteIpAddress?.ToString();
        if (address is not null)
        {
            request.Headers.Add("X-Forwarded-For", address);
        }

        var language = browser.Request.Headers.AcceptLanguage.ToString();
        if (language.Length > 0)
        {
            request.Headers.TryAddWithoutValidation("Accept-Language", language);
        }
    }

    private async Task<IssuedTokens> IssuedAsync(HttpResponseMessage response, string refreshToken, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>(cancellationToken)
            ?? throw new InvalidOperationException("identity-api answered without a body.");
        var accessToken = body[AccessTokenField].GetString()
            ?? throw new InvalidOperationException("identity-api answered without an access token.");
        var token = new JsonWebToken(accessToken);
        var expiresAt = new DateTimeOffset(token.ValidTo, TimeSpan.Zero);
        // A token whose clock is off says nothing useful; the lifetime it was issued for is then counted from now.
        if (expiresAt <= _timeProvider.GetUtcNow() && body.TryGetValue("expiresIn", out var expiresIn))
        {
            expiresAt = _timeProvider.GetUtcNow().AddSeconds(expiresIn.GetInt32());
        }

        return new IssuedTokens(accessToken, refreshToken, expiresAt, Guid.Parse(token.Subject));
    }

    /// <summary>The refresh token identity-api set, or null when it set none (or removed it).</summary>
    private static string? RefreshTokenIn(HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var cookies))
        {
            return null;
        }

        var prefix = RefreshCookieName + "=";
        var value = cookies
            .Where(cookie => cookie.StartsWith(prefix, StringComparison.Ordinal))
            .Select(cookie => cookie[prefix.Length..].Split(';', 2)[0])
            .FirstOrDefault();
        return string.IsNullOrEmpty(value) ? null : value;
    }
}
