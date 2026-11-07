namespace Acme.Identity.Persistence.Entities;

/// <summary>
/// One link of a sign-in's chain of refresh tokens. Signing in starts a chain (<see cref="FamilyId"/>, which is also the
/// access tokens' <c>sid</c>); every refresh replaces the token in use with the next one. Only the hash is kept, so a
/// copy of this table is not a copy of anyone's sign-in. Not an audited entity: it is a security record, ended by
/// <see cref="RevokedAt"/> or by <see cref="ExpiresAt"/>, never soft-deleted.
/// </summary>
public sealed class RefreshToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    /// <summary>The sign-in this token belongs to: the same for every token the chain replaces.</summary>
    public Guid FamilyId { get; set; }

    /// <summary>The SHA-256 of the token, as 64 hex characters.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When the sign-in ends at the latest: the same for the whole chain, counted from signing in.</summary>
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>When this token was used and replaced. A token used again after the grace period ends the chain.</summary>
    public DateTimeOffset? RotatedAt { get; set; }

    /// <summary>
    /// The token that replaced this one, sealed with a key only this token gives. Within the grace period the holder of this
    /// token gets the same replacement again (an answer that was lost), rather than nothing it can keep using.
    /// </summary>
    public byte[]? NextTokenSealed { get; set; }

    /// <summary>Set on every token of the chain when the person signs out, or when a replaced token is used again.</summary>
    public DateTimeOffset? RevokedAt { get; set; }
}
