using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Configuration;

namespace Acme.ServiceDefaults.Authentication;

/// <summary>
/// Asks identity-api (<c>GET v1/sessions/current</c>, with the access token) whether the token's sign-in is open: 204, or
/// 401 when it was ended. When identity-api cannot be reached the token, which is already verified and lasts minutes, is
/// accepted: a service does not stop serving because the sign-in authority restarts, and the check resumes with it.
/// </summary>
public sealed class HttpSessionStatusChecker : ISessionStatusChecker
{
    private readonly HttpClient _httpClient;
    private readonly SessionStatusCache _cache;
    private readonly string? _identityApiUrl;
    private readonly ILogger<HttpSessionStatusChecker> _logger;

    public HttpSessionStatusChecker(HttpClient httpClient, SessionStatusCache cache, IConfiguration configuration, ILogger<HttpSessionStatusChecker> logger)
    {
        _httpClient = httpClient;
        _cache = cache;
        _identityApiUrl = configuration["services:identity-api:http:0"];
        _logger = logger;
    }

    public Task<bool> IsActiveAsync(AccessTokenSession session, CancellationToken cancellationToken) =>
        _cache.IsActiveAsync(session, ct => AskAsync(session, ct), cancellationToken);

    private async Task<bool> AskAsync(AccessTokenSession session, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_identityApiUrl))
        {
            return true;
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{_identityApiUrl}/v1/sessions/current");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            return response.StatusCode != HttpStatusCode.Unauthorized;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(exception, "identity-api could not be asked whether a sign-in is open; the token is accepted.");
            return true;
        }
    }
}
