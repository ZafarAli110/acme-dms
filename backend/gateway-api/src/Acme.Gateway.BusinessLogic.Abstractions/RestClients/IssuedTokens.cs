namespace Acme.Gateway.BusinessLogic.Abstractions.RestClients;

/// <summary>What identity-api issued at a sign-in or a refresh.</summary>
public sealed record IssuedTokens(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAt, Guid UserId);
