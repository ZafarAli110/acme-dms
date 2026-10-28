namespace Acme.ServiceDefaults.DatabaseErrors;

/// <summary>
/// Messages for known constraints, by constraint (or unique index) name: a unique violation on
/// <c>ix_users_email</c> then says "A user with this email already exists." instead of the generic conflict message.
/// </summary>
public sealed class DatabaseErrorOptions
{
    public IDictionary<string, string> ConstraintMessages { get; } = new Dictionary<string, string>(StringComparer.Ordinal);
}
