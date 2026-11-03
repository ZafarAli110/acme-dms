namespace Acme.ServiceDefaults.DatabaseErrors;

/// <summary>
/// A database failure translated for the client: the status and a safe <see cref="Detail"/> go into problem details;
/// the SQLSTATE, table and constraint are for the log only, never the response.
/// </summary>
public sealed record DatabaseError(int Status, string Detail, string? SqlState, string? TableName, string? ConstraintName);
