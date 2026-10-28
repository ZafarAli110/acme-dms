using Microsoft.IdentityModel.Tokens;

namespace Acme.Identity.BusinessLogic.Abstractions.Signing;

/// <summary>The RSA key identity-api signs tokens with. Created on first use and kept in the identity database.</summary>
public interface ISigningKeyProvider
{
    Task<RsaSecurityKey> GetSigningKeyAsync(CancellationToken cancellationToken);
}
