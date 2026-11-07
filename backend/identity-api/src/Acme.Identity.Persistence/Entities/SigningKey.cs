namespace Acme.Identity.Persistence.Entities;

/// <summary>
/// An RSA key identity-api signs access tokens with. Keys rotate: a new one is made and published before it signs anything,
/// signs from <see cref="ActivatesAt"/>, and stays published after the next one takes over for as long as a token it signed
/// can live. The private key is kept encrypted (ASP.NET Data Protection, whose own keys are not in this database), so a copy
/// of this table cannot sign a token.
/// </summary>
public sealed class SigningKey
{
    public string Id { get; set; } = string.Empty;

    /// <summary>The private key (PKCS #8), encrypted with Data Protection.</summary>
    public byte[]? ProtectedPrivateKey { get; set; }

    /// <summary>
    /// The private key unencrypted, as it was kept before keys were protected. A key found with it is protected and this is
    /// cleared the first time identity-api loads it.
    /// </summary>
    public byte[]? PrivateKeyPkcs8 { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>From when this key signs; it is published (JWKS) before, so every service knows it by then.</summary>
    public DateTimeOffset ActivatesAt { get; set; }
}
