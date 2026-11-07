using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Acme.Gateway.RestClients.Identity;

/// <summary>
/// identity-api's token endpoints over HTTP. The browser's address goes in <c>X-Forwarded-For</c> (identity-api trusts one hop:
/// this one). identity-api answers with the refresh token in a cookie; here it is read from <c>Set-Cookie</c>. A refused
/// connection, no answer in time, or an answer that is neither a token nor a refusal meant for the person (400, 401, 429)
/// becomes <see cref="IdentityUnavailableException"/>.
/// </summary>
internal sealed class IdentityClient : IIdentityClient
{
    private const string RefreshCookieName = "acme_refresh";

    /// <summary>What identity-api asks of a refresh or revoke: a header only a page's own request (or this gateway) adds.</summary>
    private const string FromThePageHeader = "X-Requested-With";
    private const string FromThePageValue = "acme-web";

    /// <summary>The refusals that are the person's to see, passed on as they are; anything else is identity-api failing.</summary>
    private static readonly HashSet<HttpStatusCode> _refusalsForThePerson =
        [HttpStatusCode.BadRequest, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests];

    private readonly HttpClient _httpClient;
    private readonly TimeProvider _timeProvider;

    public IdentityClient(HttpClient httpClient, TimeProvider timeProvider)
    {
        _httpClient = httpClient;
        _timeProvider = timeProvider;
    }

    public async Task<IdentitySignInResult> SignInAsync(string email, string password, CallerContext caller, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("/v1/tokens", UriKind.Relative))
        {
            Content = JsonContent.Create(new { email, password }),
        };
        Forward(request, caller);
        using var response = await SendAsync(request, cancellationToken);
        if (_refusalsForThePerson.Contains(response.StatusCode))
        {
            return new IdentitySignInResult(null, await RefusalAsync(response, cancellationToken));
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new IdentityUnavailableException($"identity-api answered {(int)response.StatusCode} to a sign-in.");
        }

        var refreshToken = RefreshTokenIn(response)
            ?? throw new InvalidOperationException("identity-api signed someone in without a refresh token.");
        return new IdentitySignInResult(await IssuedAsync(response, refreshToken, cancellationToken), null);
    }

    public async Task<IssuedTokens?> RefreshAsync(string refreshToken, CallerContext caller, CancellationToken cancellationToken)
    {
        using var request = TokenRequest("/v1/tokens/refresh", refreshToken, caller);
        using var response = await SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new IdentityUnavailableException($"identity-api answered {(int)response.StatusCode} to a refresh.");
        }

        return await IssuedAsync(response, RefreshTokenIn(response) ?? refreshToken, cancellationToken);
    }

    public async Task RevokeAsync(string refreshToken, CallerContext caller, CancellationToken cancellationToken)
    {
        using var request = TokenRequest("/v1/tokens/revoke", refreshToken, caller);
        using var response = await SendAsync(request, cancellationToken);
    }

    /// <summary>Sends, turning "not reachable" and "no answer in time" into <see cref="IdentityUnavailableException"/>.</summary>
    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        try
        {
            return await _httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new IdentityUnavailableException("identity-api could not be reached.", exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new IdentityUnavailableException("identity-api did not answer in time.", exception);
        }
    }

    private static HttpRequestMessage TokenRequest(string path, string refreshToken, CallerContext caller)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, new Uri(path, UriKind.Relative));
        request.Headers.Add("Cookie", $"{RefreshCookieName}={refreshToken}");
        request.Headers.Add(FromThePageHeader, FromThePageValue);
        Forward(request, caller);
        return request;
    }

    private static void Forward(HttpRequestMessage request, CallerContext caller)
    {
        if (caller.Address is { } address)
        {
            request.Headers.Add("X-Forwarded-For", address);
        }

        if (!string.IsNullOrEmpty(caller.Language))
        {
            request.Headers.TryAddWithoutValidation("Accept-Language", caller.Language);
        }
    }

    private static async Task<IdentityRefusal> RefusalAsync(HttpResponseMessage response, CancellationToken cancellationToken) =>
        new(
            (int)response.StatusCode,
            response.Content.Headers.ContentType?.ToString(),
            response.Headers.RetryAfter?.ToString(),
            await response.Content.ReadAsByteArrayAsync(cancellationToken));

    private async Task<IssuedTokens> IssuedAsync(HttpResponseMessage response, string refreshToken, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, JsonElement>>(cancellationToken)
            ?? throw new InvalidOperationException("identity-api answered without a body.");
        var accessToken = body["accessToken"].GetString()
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
