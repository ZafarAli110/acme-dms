namespace Acme.Gateway.BusinessLogic.Abstractions.RestClients;

/// <summary>identity-api's answer to a refused sign-in (400, 401 or 429), to pass on unchanged.</summary>
public sealed record IdentityRefusal(int Status, string? ContentType, string? RetryAfter, byte[] Body);
