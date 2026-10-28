using System.Text.Json.Serialization;

namespace Acme.Identity.DTO.WellKnown;

public sealed record JsonWebKeySetDto([property: JsonPropertyName("keys")] IReadOnlyList<JsonWebKeyDto> Keys);

public sealed record JsonWebKeyDto(
    [property: JsonPropertyName("kty")] string Kty,
    [property: JsonPropertyName("use")] string Use,
    [property: JsonPropertyName("alg")] string Alg,
    [property: JsonPropertyName("kid")] string Kid,
    [property: JsonPropertyName("n")] string N,
    [property: JsonPropertyName("e")] string E);
