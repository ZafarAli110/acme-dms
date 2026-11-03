namespace Acme.ServiceDefaults.Authorization;

/// <summary>
/// Who is calling, for which dealer, at which location, with which permissions. Built once per request from the
/// validated access token and the <c>x-location-id</c> header.
/// </summary>
public sealed record AcmeUserContext(Guid UserId, Guid DealerId, Guid? LocationId, IReadOnlyList<string> Permissions)
{
    public bool HasPermission(string permission) => Permissions.Contains(permission, StringComparer.Ordinal);
}
