namespace Acme.Gateway;

/// <summary>
/// A service says where a new record lives relative to itself (Location: /v1/customers/42). The gateway removed a prefix
/// on the way in (/api/dealership), so it puts it back on the way out: the caller gets the URL it would use.
/// </summary>
internal static class LocationPrefix
{
    public static string Apply(string prefix, string location)
    {
        var isServiceRelative = location.StartsWith('/') && !location.StartsWith("//", StringComparison.Ordinal);
        if (!isServiceRelative || location.StartsWith(prefix + "/", StringComparison.Ordinal))
        {
            return location;
        }

        return prefix + location;
    }
}
