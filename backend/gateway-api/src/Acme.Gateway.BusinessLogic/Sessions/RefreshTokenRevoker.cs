using Acme.Gateway.BusinessLogic.Abstractions.Clients;
using Microsoft.Extensions.Logging;

namespace Acme.Gateway.BusinessLogic.Sessions;

/// <summary>
/// Ends the refresh token of a session that has just been deleted, at identity-api. It waits a little at most and never fails:
/// nothing outside the deleted session had that token, so a revoke that does not get through does no harm.
/// </summary>
internal sealed partial class RefreshTokenRevoker
{
    private static readonly TimeSpan _wait = TimeSpan.FromSeconds(3);

    private readonly IIdentityClient _identityClient;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<RefreshTokenRevoker> _logger;

    public RefreshTokenRevoker(IIdentityClient identityClient, TimeProvider timeProvider, ILogger<RefreshTokenRevoker> logger)
    {
        _identityClient = identityClient;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task RevokeQuietlyAsync(string refreshToken, CallerContext caller)
    {
        using var wait = new CancellationTokenSource(_wait, _timeProvider);
        try
        {
            await _identityClient.RevokeAsync(refreshToken, caller, wait.Token);
        }
        catch (Exception exception) when (exception is IdentityUnavailableException or OperationCanceledException)
        {
            LogRevokeFailed(_logger, exception);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "identity-api could not end the refresh token of an ended session; the session is gone")]
    private static partial void LogRevokeFailed(ILogger logger, Exception exception);
}
