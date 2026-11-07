namespace Acme.Gateway.BusinessLogic.Abstractions.Clients;

/// <summary>
/// The browser the gateway acts for when it calls identity-api: its address (identity-api's limits count each person, not the
/// gateway) and its language (identity-api's messages). The service layer reads them from the request; handlers never do.
/// </summary>
public sealed record CallerContext(string? Address, string? Language);
