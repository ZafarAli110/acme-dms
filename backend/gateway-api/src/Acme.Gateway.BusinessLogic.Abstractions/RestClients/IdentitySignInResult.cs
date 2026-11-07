namespace Acme.Gateway.BusinessLogic.Abstractions.RestClients;

/// <summary>A sign-in identity-api accepted (<see cref="Tokens"/>) or refused (<see cref="Refusal"/>).</summary>
public sealed record IdentitySignInResult(IssuedTokens? Tokens, IdentityRefusal? Refusal);
