namespace Acme.Gateway.BusinessLogic.Abstractions.Sessions;

/// <summary>How long a browser's sign-in lasts, and when the gateway renews its access token.</summary>
public static class SessionSettings
{
    /// <summary>Must match identity-api's <c>TokenSettings.RefreshLifetimeSeconds</c>: a sign-in lasts at most this long.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);

    /// <summary>A request this close to the access token's expiry gets a new one first, so the service never sees it expire.</summary>
    public static readonly TimeSpan RenewEarly = TimeSpan.FromSeconds(60);

    /// <summary>
    /// A renewal's own time limit. Not the browser's: once identity-api replaces the refresh token, the new one must be saved
    /// even if the browser has gone, or the session would keep only the replaced one.
    /// </summary>
    public static readonly TimeSpan RenewalTimeout = TimeSpan.FromSeconds(15);

    /// <summary>
    /// How long a renewal holds its lease on the session (<c>renewing_until</c>). Longer than <see cref="RenewalTimeout"/>, so a
    /// renewal still running is never overtaken; a gateway that stopped mid-renewal lets the next one in after this.
    /// </summary>
    public static readonly TimeSpan Lease = TimeSpan.FromSeconds(20);
}
