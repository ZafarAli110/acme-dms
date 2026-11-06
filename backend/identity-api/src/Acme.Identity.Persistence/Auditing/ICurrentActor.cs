namespace Acme.Identity.Persistence.Auditing;

/// <summary>Who is making the change being saved: the signed-in user, or <see cref="SystemUser.Id"/> for background work.</summary>
public interface ICurrentActor
{
    Guid UserId { get; }

    /// <summary>The signed-in user's dealer, which every query is filtered by; null with no one signed in (sign-in itself, background work).</summary>
    Guid? DealerId { get; }
}
