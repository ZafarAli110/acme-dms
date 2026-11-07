namespace Acme.Gateway.Persistence.Entities;

/// <summary>
/// One browser's sign-in, kept by the gateway (the backend for the frontend). The browser holds only a random value in an
/// httpOnly cookie; the tokens identity-api issued are here, encrypted with a key derived from that value, so this table alone
/// signs no one in. Deleting the row ends the sign-in at once.
/// </summary>
public sealed class Session
{
    /// <summary>The SHA-256 of the cookie's value, in hex: the cookie is never stored.</summary>
    public string Id { get; set; } = "";

    /// <summary>Whose sign-in it is (the access token's <c>sub</c>): to end every sign-in of one person.</summary>
    public Guid UserId { get; set; }

    /// <summary>The access and refresh tokens, encrypted with a key only the cookie's value gives.</summary>
    public byte[] Tokens { get; set; } = [];

    /// <summary>When the access token in <see cref="Tokens"/> expires: a request shortly before gets a new one first.</summary>
    public DateTimeOffset AccessTokenExpiresAt { get; set; }

    /// <summary>
    /// Set while a renewal runs (its lease), so only one renews at a time, on every gateway instance, with no transaction held
    /// across the call to identity-api. Null when none runs; a lease past its time was left by a renewal that stopped.
    /// </summary>
    public DateTimeOffset? RenewingUntil { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>The sign-in's end however often it is renewed: identity-api's refresh lifetime, from the moment of signing in.</summary>
    public DateTimeOffset ExpiresAt { get; set; }
}
