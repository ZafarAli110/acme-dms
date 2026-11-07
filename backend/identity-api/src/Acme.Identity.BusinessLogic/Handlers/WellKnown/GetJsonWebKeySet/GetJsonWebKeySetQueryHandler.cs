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
        // Every key a token may be checked with: the one signing now, the next one, and the ones before it while their
        // tokens can live. A service that meets a key it does not know fetches this list again.
        var published = await _signingKeyProvider.GetPublishedKeysAsync(cancellationToken);
        var keys = published.Select(signingKey =>
        {
            var parameters = signingKey.Rsa.ExportParameters(includePrivateParameters: false);
            return new JsonWebKeyDto(
                Kty: "RSA",
                Use: "sig",
                Alg: SecurityAlgorithms.RsaSha256,
                Kid: signingKey.KeyId,
                N: Base64UrlEncoder.Encode(parameters.Modulus),
                E: Base64UrlEncoder.Encode(parameters.Exponent));
        }).ToList();

        return new JsonWebKeySetDto(keys);
    }
}
