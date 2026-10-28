using System.Net.Sockets;
using Acme.ServiceDefaults.DatabaseErrors;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Acme.Documents.Tests.DatabaseErrors;

[TestClass]
public sealed class PostgresErrorMapperTests
{
    private static readonly Dictionary<string, string> NoConstraintMessages = [];

    [TestMethod]
    [DataRow(PostgresErrorCodes.UniqueViolation, 409, PostgresErrorMapper.DuplicateValue)]
    [DataRow(PostgresErrorCodes.ForeignKeyViolation, 409, PostgresErrorMapper.MissingOrInUseReference)]
    [DataRow(PostgresErrorCodes.NotNullViolation, 400, PostgresErrorMapper.InvalidValue)]
    [DataRow(PostgresErrorCodes.CheckViolation, 400, PostgresErrorMapper.InvalidValue)]
    [DataRow(PostgresErrorCodes.StringDataRightTruncation, 400, PostgresErrorMapper.InvalidValue)]
    [DataRow(PostgresErrorCodes.InvalidTextRepresentation, 400, PostgresErrorMapper.InvalidValue)]
    [DataRow(PostgresErrorCodes.SerializationFailure, 409, PostgresErrorMapper.ConcurrentChange)]
    [DataRow(PostgresErrorCodes.DeadlockDetected, 409, PostgresErrorMapper.ConcurrentChange)]
    [DataRow(PostgresErrorCodes.QueryCanceled, 503, PostgresErrorMapper.DatabaseUnavailable)]
    [DataRow(PostgresErrorCodes.LockNotAvailable, 503, PostgresErrorMapper.DatabaseUnavailable)]
    [DataRow(PostgresErrorCodes.TooManyConnections, 503, PostgresErrorMapper.DatabaseUnavailable)]
    [DataRow(PostgresErrorCodes.AdminShutdown, 503, PostgresErrorMapper.DatabaseUnavailable)]
    [DataRow(PostgresErrorCodes.CannotConnectNow, 503, PostgresErrorMapper.DatabaseUnavailable)]
    [DataRow(PostgresErrorCodes.ConnectionFailure, 503, PostgresErrorMapper.DatabaseUnavailable)]
    public void Map_TurnsTheSqlStateIntoAStatusAndASafeMessage(string sqlState, int status, string detail)
    {
        var error = PostgresErrorMapper.Map(Saving(Postgres(sqlState)), NoConstraintMessages);

        Assert.IsNotNull(error);
        Assert.AreEqual(status, error.Status);
        Assert.AreEqual(detail, error.Detail);
        Assert.AreEqual(sqlState, error.SqlState);
    }

    [TestMethod]
    public void Map_UsesTheMessageOfAKnownConstraint()
    {
        var constraintMessages = new Dictionary<string, string> { ["ix_users_email"] = "A user with this email already exists." };

        var error = PostgresErrorMapper.Map(Saving(Postgres(PostgresErrorCodes.UniqueViolation, "users", "ix_users_email")), constraintMessages);

        Assert.AreEqual("A user with this email already exists.", error?.Detail);
        Assert.AreEqual("ix_users_email", error?.ConstraintName);
        Assert.AreEqual("users", error?.TableName);
    }

    [TestMethod]
    public void Map_NeverPutsTheTableOrConstraintInTheMessage()
    {
        var error = PostgresErrorMapper.Map(Saving(Postgres(PostgresErrorCodes.UniqueViolation, "users", "ix_users_email")), NoConstraintMessages);

        Assert.IsNotNull(error);
        Assert.DoesNotContain("users", error.Detail);
        Assert.DoesNotContain("ix_", error.Detail);
    }

    [TestMethod]
    public void Map_TreatsAConnectionThatNeverAnsweredAsUnavailable()
    {
        var error = PostgresErrorMapper.Map(new NpgsqlException("Failed to connect", new SocketException()), NoConstraintMessages);

        Assert.AreEqual(503, error?.Status);
    }

    [TestMethod]
    public void Map_LeavesAnUnknownSqlStateAndANonDatabaseErrorAlone()
    {
        Assert.IsNull(PostgresErrorMapper.Map(Saving(Postgres(PostgresErrorCodes.DivisionByZero)), NoConstraintMessages));
        Assert.IsNull(PostgresErrorMapper.Map(new InvalidOperationException("not a database error"), NoConstraintMessages));
    }

    // EF Core reports a failed save as a DbUpdateException whose inner exception is Npgsql's PostgresException.
    private static DbUpdateException Saving(Exception postgres) => new("An error occurred while saving the entity changes.", postgres);

    private static PostgresException Postgres(string sqlState, string? tableName = null, string? constraintName = null) =>
        new("server message with internals", "ERROR", "ERROR", sqlState, tableName: tableName, constraintName: constraintName);
}
