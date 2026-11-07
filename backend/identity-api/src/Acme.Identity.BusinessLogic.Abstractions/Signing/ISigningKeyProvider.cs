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
}
