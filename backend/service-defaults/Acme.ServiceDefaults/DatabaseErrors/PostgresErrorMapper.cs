using Npgsql;

namespace Acme.ServiceDefaults.DatabaseErrors;

/// <summary>
/// Translates a Postgres failure, wherever it sits in the exception chain (EF Core wraps it in a DbUpdateException),
/// into a status and a message the client can act on. Same table as dealership-api's pg-error mapping. Messages never
/// name SQL, tables or constraints; a known constraint can have its own message (<see cref="DatabaseErrorOptions"/>).
/// </summary>
public static class PostgresErrorMapper
{
    public const string DuplicateValue = "A record with the same value already exists.";
    public const string MissingOrInUseReference = "This refers to a record that does not exist, or the record is still in use.";
    public const string InvalidValue = "A value is missing or not allowed.";
    public const string ConcurrentChange = "The record was changed at the same time by someone else. Try again.";
    public const string DatabaseUnavailable = "The database is busy or unavailable. Try again shortly.";

    private const string ConnectionExceptionClass = "08";

    /// <summary>The error for the first Postgres failure in the chain, or null when there is none (it stays a 500).</summary>
    public static DatabaseError? Map(Exception exception, IReadOnlyDictionary<string, string> constraintMessages)
    {
        ArgumentNullException.ThrowIfNull(exception);
        ArgumentNullException.ThrowIfNull(constraintMessages);

        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgres)
            {
                return MapPostgres(postgres, constraintMessages);
            }

            // No answer from the server at all (refused, reset, timed out): the same as a connection exception.
            if (current is NpgsqlException { IsTransient: true })
            {
                return new DatabaseError(StatusCodes.Status503ServiceUnavailable, DatabaseUnavailable, null, null, null);
            }
        }

        return null;
    }

    private static DatabaseError? MapPostgres(PostgresException postgres, IReadOnlyDictionary<string, string> constraintMessages)
    {
        var (status, detail) = postgres.SqlState switch
        {
            PostgresErrorCodes.UniqueViolation => (StatusCodes.Status409Conflict, DuplicateValue),
            PostgresErrorCodes.ForeignKeyViolation => (StatusCodes.Status409Conflict, MissingOrInUseReference),
            PostgresErrorCodes.NotNullViolation
                or PostgresErrorCodes.CheckViolation
                or PostgresErrorCodes.StringDataRightTruncation
                or PostgresErrorCodes.InvalidTextRepresentation => (StatusCodes.Status400BadRequest, InvalidValue),
            PostgresErrorCodes.SerializationFailure
                or PostgresErrorCodes.DeadlockDetected => (StatusCodes.Status409Conflict, ConcurrentChange),
            PostgresErrorCodes.QueryCanceled
                or PostgresErrorCodes.LockNotAvailable
                or PostgresErrorCodes.TooManyConnections
                or PostgresErrorCodes.AdminShutdown
                or PostgresErrorCodes.CannotConnectNow => (StatusCodes.Status503ServiceUnavailable, DatabaseUnavailable),
            var sqlState when sqlState.StartsWith(ConnectionExceptionClass, StringComparison.Ordinal) =>
                (StatusCodes.Status503ServiceUnavailable, DatabaseUnavailable),
            _ => (0, string.Empty),
        };
        if (status == 0)
        {
            return null;
        }

        if (postgres.ConstraintName is { } constraint && constraintMessages.TryGetValue(constraint, out var constraintMessage))
        {
            detail = constraintMessage;
        }

        return new DatabaseError(status, detail, postgres.SqlState, postgres.TableName, postgres.ConstraintName);
    }
}
