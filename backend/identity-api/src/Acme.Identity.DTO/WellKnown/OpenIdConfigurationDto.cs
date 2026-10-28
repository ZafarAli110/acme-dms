using System.Text.Json.Serialization;

namespace Acme.Identity.DTO.WellKnown;

/// <summary>The minimal OpenID discovery document other services use to find the signing keys.</summary>
public sealed record OpenIdConfigurationDto(
    [property: JsonPropertyName("issuer")] string Issuer,
    [property: JsonPropertyName("jwks_uri")] string JwksUri,
    [property: JsonPropertyName("token_endpoint")] string TokenEndpoint,
    [property: JsonPropertyName("id_token_signing_alg_values_supported")] IReadOnlyList<string> SigningAlgorithms);
