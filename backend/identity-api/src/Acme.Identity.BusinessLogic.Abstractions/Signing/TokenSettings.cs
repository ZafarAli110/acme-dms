namespace Acme.Identity.BusinessLogic.Abstractions.Signing;

/// <summary>Values every Acme service agrees on when issuing and validating tokens.</summary>
public static class TokenSettings
{
    public const string Issuer = "acme-identity";
    public const string Audience = "acme-dms";

    /// <summary>
    /// An access token is short: a copied one stops working after this, and nothing can take it back sooner. A signed-in
    /// person keeps working because the app trades the refresh token for a new one (v1/tokens/refresh).
    /// </summary>
    public const int LifetimeSeconds = 15 * 60;

    /// <summary>
    /// How long a sign-in lasts at most: the refresh token's lifetime, from the moment of signing in. A refresh token is
    /// ended sooner by signing out, and a refresh reads the person's roles and locations again.
    /// </summary>
    public const int RefreshLifetimeSeconds = 8 * 60 * 60;

    /// <summary>
    /// A refresh token is replaced every time it is used. Presenting one that was already replaced is a stolen token, or
    /// it is the same person's second request racing the first, whose answer had not arrived yet. Within this many seconds
    /// it is the race and is tolerated; after them it ends the whole sign-in.
    /// </summary>
    public const int RefreshReuseGraceSeconds = 20;
}
