namespace Acme.Documents.Persistence.Auditing;

/// <summary>Who is making the change being saved: the signed-in user, or <see cref="SystemUser.Id"/> for background work.</summary>
public interface ICurrentActor
{
    Guid UserId { get; }
}
