namespace Acme.Gateway.BusinessLogic.Handlers.Sessions;

/// <summary>How long a browser's sign-in lasts, and when and how the gateway renews its access token.</summary>
internal static class SessionSettings
{
    /// <summary>
    /// A sign-in lasts at most this long. A copy of identity-api's <c>TokenSettings.RefreshLifetimeSeconds</c>: the two
    /// services share no code, so a change there is made here too (<c>docs/ARCHITECTURE.md</c>, "Signing in").
    /// </summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);

    /// <summary>A request this close to the access token's expiry gets a new one first, so the service never sees it expire.</summary>
    public static readonly TimeSpan RenewEarly = TimeSpan.FromSeconds(60);

    /// <summary>
    /// A renewal's own time limit for its call to identity-api. Not the browser's: once identity-api replaces the refresh
    /// token, the new one must be saved even if the browser has gone.
    /// </summary>
    public static readonly TimeSpan RenewalTimeout = TimeSpan.FromSeconds(10);

    /// <summary>
    /// The time limit of the one retry after a renewal got no answer. identity-api may have replaced the token and lost the
    /// answer; asked again at once, inside its grace period, it gives the same replacement. Both calls end inside
    /// <see cref="Lease"/>.
    /// </summary>
    public static readonly TimeSpan RenewalRetryTimeout = TimeSpan.FromSeconds(4);

    /// <summary>
    /// How long a renewal holds its lease on the session (<c>renewing_until</c>): longer than <see cref="RenewalTimeout"/> and
    /// <see cref="RenewalRetryTimeout"/> together, so a renewal still running is not overtaken, and shorter than identity-api's 20-second grace period, so a gateway that
    /// stopped mid-renewal is followed by one that asks again inside the grace and gets the same replacement token.
    /// </summary>
    public static readonly TimeSpan Lease = TimeSpan.FromSeconds(15);
}
