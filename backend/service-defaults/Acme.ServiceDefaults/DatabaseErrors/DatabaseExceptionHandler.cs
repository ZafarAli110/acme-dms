using System.Text.Json;
using Acme.ServiceDefaults.Observability;
using Acme.ServiceDefaults.ProblemDetails;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.Options;

namespace Acme.ServiceDefaults.DatabaseErrors;

/// <summary>
/// Turns a Postgres failure that reached the top of a request into problem details with a meaningful message, instead
/// of a generic 500: a duplicate is a 409, a missing value a 400, a busy database a 503. Anything else is left for the
/// next handler. The log line carries the SQLSTATE, table, constraint and the cause chain; the response carries none.
/// </summary>
internal sealed partial class DatabaseExceptionHandler : IExceptionHandler
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ILogger<DatabaseExceptionHandler> _logger;
    private readonly IReadOnlyDictionary<string, string> _constraintMessages;

    public DatabaseExceptionHandler(ILogger<DatabaseExceptionHandler> logger, IOptions<DatabaseErrorOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _logger = logger;
        _constraintMessages = new Dictionary<string, string>(options.Value.ConstraintMessages, StringComparer.Ordinal);
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        var error = PostgresErrorMapper.Map(exception, _constraintMessages);
        if (error is null)
        {
            return false;
        }

        // 4xx is the caller's problem (a warning); 5xx is ours (an error). docs/standards/api-errors.md.
        var level = error.Status >= StatusCodes.Status500InternalServerError ? LogLevel.Error : LogLevel.Warning;
        if (_logger.IsEnabled(level))
        {
            var causeChain = ExceptionChain.Describe(exception);
            LogDatabaseError(_logger, level, exception, error.SqlState, error.TableName, error.ConstraintName, error.Status, causeChain);
        }

        httpContext.Response.StatusCode = error.Status;
        // The detail is one of the mapper's fixed messages, so it is safe to show even on a 503.
        var problem = ProblemDetailsDtoFactory.CreateWithSafeDetail(httpContext, error.Status, error.Detail);
        await httpContext.Response.WriteAsJsonAsync(problem, JsonOptions, "application/problem+json", cancellationToken);
        return true;
    }

    [LoggerMessage(Message = "Database error {SqlState} (table {TableName}, constraint {ConstraintName}) returned as {Status}: {CauseChain}")]
    private static partial void LogDatabaseError(ILogger logger, LogLevel level, Exception exception, string? sqlState, string? tableName, string? constraintName, int status, string causeChain);
}
