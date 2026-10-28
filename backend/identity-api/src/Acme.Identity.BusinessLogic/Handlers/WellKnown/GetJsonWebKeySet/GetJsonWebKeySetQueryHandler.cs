using Acme.Identity.BusinessLogic.Abstractions.Handlers.WellKnown.GetJsonWebKeySet;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.DTO.WellKnown;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Identity.BusinessLogic.Handlers.WellKnown.GetJsonWebKeySet;

internal sealed class GetJsonWebKeySetQueryHandler : IGetJsonWebKeySetQueryHandler
{
    private readonly ISigningKeyProvider _signingKeyProvider;

    public GetJsonWebKeySetQueryHandler(ISigningKeyProvider signingKeyProvider)
    {
        _signingKeyProvider = signingKeyProvider;
    }

    public async Task<JsonWebKeySetDto> ExecuteAsync(CancellationToken cancellationToken)
    {
        var signingKey = await _signingKeyProvider.GetSigningKeyAsync(cancellationToken).ConfigureAwait(false);
        var parameters = signingKey.Rsa.ExportParameters(includePrivateParameters: false);

        var key = new JsonWebKeyDto(
            Kty: "RSA",
            Use: "sig",
            Alg: SecurityAlgorithms.RsaSha256,
            Kid: signingKey.KeyId,
            N: Base64UrlEncoder.Encode(parameters.Modulus),
            E: Base64UrlEncoder.Encode(parameters.Exponent));

        return new JsonWebKeySetDto([key]);
    }
}
