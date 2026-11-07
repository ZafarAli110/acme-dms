using Microsoft.IdentityModel.Tokens;

namespace Acme.Identity.BusinessLogic.Abstractions.Signing;

/// <summary>
/// The RSA keys identity-api signs tokens with, kept encrypted in the identity database and rotated
/// (<see cref="TokenSettings.SigningKeyRotateEvery"/>).
/// </summary>
public interface ISigningKeyProvider
{
    /// <summary>The key that signs tokens now.</summary>
    Task<RsaSecurityKey> GetSigningKeyAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Every key a token may be checked with: the one signing now, the next one (published ahead), and the ones before it
    /// while a token they signed can still be shown. The JWKS lists these.
    /// </summary>
    Task<IReadOnlyList<RsaSecurityKey>> GetPublishedKeysAsync(CancellationToken cancellationToken);

    /// <summary>Whether this instance can sign now: false when its Data Protection keys cannot open the key in use.</summary>
    Task<bool> CanSignAsync(CancellationToken cancellationToken);

    /// <summary>
    /// The way out when no instance can open the key in use (its Data Protection keys were lost): deletes every key this
    /// instance cannot open and, when that leaves none signing, makes one that signs at once. A person runs it, once,
    /// with the Data Protection keys every instance shares (<c>replace-signing-keys</c>); it is never automatic, since
    /// one misconfigured instance would otherwise replace the keys of all the others. Returns how many keys it deleted.
    /// </summary>
    Task<int> ReplaceKeysItCannotOpenAsync(CancellationToken cancellationToken);
}
