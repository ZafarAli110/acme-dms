using Acme.Gateway.BusinessLogic.Abstractions.Clients;

namespace Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Delete;

/// <summary>Signing a browser out: its session ends at once, on every gateway instance, and its refresh token at identity-api.</summary>
public interface IDeleteSessionCommandHandler
{
    Task ExecuteAsync(string cookieValue, CallerContext caller, CancellationToken cancellationToken);
}
