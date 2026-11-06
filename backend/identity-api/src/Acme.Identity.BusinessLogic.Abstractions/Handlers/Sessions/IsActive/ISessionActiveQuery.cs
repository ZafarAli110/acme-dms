namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Sessions.IsActive;

public interface ISessionActiveQuery
{
    /// <summary>True while the sign-in has a token that is not revoked and not past its lifetime.</summary>
    Task<bool> ExecuteAsync(Guid sessionId, CancellationToken cancellationToken);
}
