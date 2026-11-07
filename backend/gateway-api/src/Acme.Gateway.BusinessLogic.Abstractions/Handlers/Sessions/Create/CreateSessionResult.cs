using Acme.Gateway.BusinessLogic.Abstractions.RestClients;

namespace Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Create;

/// <summary>
/// The cookie value of the new session (stored nowhere), or identity-api's refusal. A result, not an exception: the refusal
/// goes to the browser exactly as identity-api gave it (<c>business-handlers.md</c>).
/// </summary>
public sealed record CreateSessionResult(string? CookieValue, IdentityRefusal? Refusal);
