namespace Acme.Identity.Persistence.Entities;

/// <summary>
/// One sign-in, as the service remembers it: what the app trades for a new access token. Only the hash is kept, so a
/// copy of this table is not a copy of anyone's sign-in. Not an audited entity: it is a security record, ended by
/// <see cref="RevokedAt"/> or by <see cref="ExpiresAt"/>, never soft-deleted.
/// </summary>
public sealed class RefreshToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    /// <summary>The SHA-256 of the token, as 64 hex characters.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Set when the person signs out; a revoked token is never accepted again.</summary>
    public DateTimeOffset? RevokedAt { get; set; }
}
