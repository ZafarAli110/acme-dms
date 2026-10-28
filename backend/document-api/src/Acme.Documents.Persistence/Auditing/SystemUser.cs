namespace Acme.Documents.Persistence.Auditing;

/// <summary>The actor recorded for work no signed-in user does (processing documents). The same id in every service.</summary>
public static class SystemUser
{
    public static readonly Guid Id = Guid.Empty;
}
