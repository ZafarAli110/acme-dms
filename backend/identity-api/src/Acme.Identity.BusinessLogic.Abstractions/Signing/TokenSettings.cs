namespace Acme.Identity.BusinessLogic.Abstractions.Signing;

/// <summary>Values every Acme service agrees on when issuing and validating tokens.</summary>
public static class TokenSettings
{
    public const string Issuer = "acme-identity";
    public const string Audience = "acme-dms";
    public const int LifetimeSeconds = 8 * 60 * 60; // 8 hours
}
