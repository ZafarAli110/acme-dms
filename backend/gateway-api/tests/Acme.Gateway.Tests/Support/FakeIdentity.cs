using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Gateway.Tests.Support;

/// <summary>
/// identity-api's token endpoints, answering as the real one does. The password "right" signs in. Each refresh replaces the
/// refresh token (<c>Set-Cookie</c>). A replaced token shown again inside the 20-second grace gets an access token and the
/// same replacement while that is unused (none once it was used); after the grace the whole chain ends.
/// </summary>
internal sealed class FakeIdentity : HttpMessageHandler
{
    public static readonly Guid UserId = Guid.Parse("0190a000-0000-7000-8000-000000000001");
    /// <summary>identity-api's grace period for a replaced token shown again; a test sets it to zero instead of waiting.</summary>
    public TimeSpan Grace { get; set; } = TimeSpan.FromSeconds(20);
    private static readonly SymmetricSecurityKey _key = new(new byte[32]);

    private readonly ConcurrentDictionary<string, RefreshTokenState> _tokens = new();
    private readonly Lock _lock = new();
    private int _issued;
    private int _refreshes;

    /// <summary>How long the access tokens it issues live. Under a minute, the gateway renews before every request.</summary>
    public TimeSpan AccessTokenLifetime { get; set; } = TimeSpan.FromMinutes(15);

    public int Refreshes => _refreshes;

    /// <summary>identity-api is not answering: every call fails as a refused connection does.</summary>
    public bool IsDown { get; set; }

    /// <summary>The next refresh replaces the token and commits, and then its answer is lost on the way back.</summary>
    public bool LoseNextRefreshAnswer { get; set; }

    /// <summary>How many refresh answers in a row are lost after identity-api has acted on them.</summary>
    public int LoseRefreshAnswers { get; set; }

    /// <summary>When set, a refresh waits for it after replacing the token (and says so on <see cref="RefreshReplaced"/>).</summary>
    public TaskCompletionSource? HoldRefreshAnswer { get; set; }

    public TaskCompletionSource RefreshReplaced { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public ConcurrentQueue<string> Revoked { get; } = new();

    public ConcurrentQueue<string?> ForwardedFor { get; } = new();

    /// <summary>Every refresh token stops working, as when identity-api ends the sign-in.</summary>
    public void EndAll() => _tokens.Clear();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (IsDown)
        {
            throw new HttpRequestException("Connection refused (identity.test)");
        }

        ForwardedFor.Enqueue(request.Headers.TryGetValues("X-Forwarded-For", out var forwarded) ? forwarded.Single() : null);
        var path = request.RequestUri!.AbsolutePath;
        if (path == "/v1/tokens")
        {
            var body = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return body.GetProperty("password").GetString() == "right"
                ? Issue(NewRefreshToken())
                : Problem(HttpStatusCode.Unauthorized, "Wrong email or password.");
        }

        var presented = request.Headers.TryGetValues("Cookie", out var cookies) ? cookies.Single().Split('=', 2)[1] : "";
        if (path == "/v1/tokens/revoke")
        {
            Revoked.Enqueue(presented);
            EndAll();
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        }

        Interlocked.Increment(ref _refreshes);
        var renewalKey = request.Headers.TryGetValues("Idempotency-Key", out var keys) ? keys.Single() : null;
        string? next;
        lock (_lock)
        {
            if (!_tokens.TryGetValue(presented, out var state))
            {
                return Problem(HttpStatusCode.Unauthorized, "The sign-in has ended.");
            }

            if (state.ReplacedAt is not { } replacedAt)
            {
                next = NewRefreshToken();
                _tokens[presented] = state with { ReplacedAt = DateTimeOffset.UtcNow, Next = next, Key = renewalKey };
            }
            else if (DateTimeOffset.UtcNow - replacedAt <= Grace || (renewalKey is not null && state.Key == renewalKey))
            {
                next = _tokens.TryGetValue(state.Next!, out var nextState) && nextState.ReplacedAt is null ? state.Next : null;
            }
            else
            {
                EndAll();
                return Problem(HttpStatusCode.Unauthorized, "The sign-in has ended.");
            }
        }

        if (LoseNextRefreshAnswer || LoseRefreshAnswers > 0)
        {
            LoseNextRefreshAnswer = false;
            LoseRefreshAnswers = Math.Max(0, LoseRefreshAnswers - 1);
            throw new HttpRequestException("The answer was lost on the way back.");
        }

        var answer = Issue(next);
        if (HoldRefreshAnswer is { } hold)
        {
            RefreshReplaced.TrySetResult();
            await hold.Task.WaitAsync(cancellationToken);
        }

        return answer;
    }

    private string NewRefreshToken()
    {
        var token = $"refresh-{Interlocked.Increment(ref _issued)}";
        _tokens[token] = new RefreshTokenState(null, null);
        return token;
    }

    /// <summary>An access token, and the refresh token in <c>Set-Cookie</c> when there is one to give.</summary>
    private HttpResponseMessage Issue(string? refreshToken)
    {
        var accessToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity([new Claim("sub", UserId.ToString()), new Claim("jti", Guid.NewGuid().ToString())]),
            Expires = DateTime.UtcNow.Add(AccessTokenLifetime),
            NotBefore = DateTime.UtcNow.AddMinutes(-1),
            SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256),
        });
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new { accessToken, tokenType = "Bearer", expiresIn = (int)AccessTokenLifetime.TotalSeconds }),
        };
        if (refreshToken is not null)
        {
            response.Headers.Add("Set-Cookie", $"acme_refresh={refreshToken}; path=/api/identity/v1/tokens; samesite=strict; httponly");
        }

        return response;
    }

    private static HttpResponseMessage Problem(HttpStatusCode status, string detail) => new(status)
    {
        Content = new StringContent($$"""{"status":{{(int)status}},"detail":"{{detail}}"}""", System.Text.Encoding.UTF8, "application/problem+json"),
    };

    private sealed record RefreshTokenState(DateTimeOffset? ReplacedAt, string? Next, string? Key = null);
}
