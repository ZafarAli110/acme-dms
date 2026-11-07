namespace Acme.Gateway.BusinessLogic.Handlers.Sessions;

/// <summary>The tokens a session keeps, sealed together (<see cref="SessionSecrets"/>).</summary>
internal sealed record SessionTokens(string AccessToken, string RefreshToken);
