using System.Text;

namespace Acme.ServiceDefaults.Observability;

/// <summary>
/// A one-line description of an exception and its causes (inner exceptions) for a log line:
/// <c>DbUpdateException: … -> PostgresException: 23505: duplicate key …</c>. The attached exception still carries the
/// stack; this is the part a dashboard shows in the log list and that a search can match.
/// </summary>
public static class ExceptionChain
{
    /// <summary>Causes described below the exception itself; deeper ones are cut off. dealership-api: MAX_ERROR_CAUSE_DEPTH.</summary>
    public const int MaxCauseDepth = 3;

    public const string DepthReached = "max_error_cause_depth_reached";

    private const string Separator = " -> ";

    public static string Describe(Exception exception)
    {
        ArgumentNullException.ThrowIfNull(exception);

        var description = new StringBuilder();
        var depth = 0;
        for (var current = exception; current is not null; current = current.InnerException, depth++)
        {
            if (depth > 0)
            {
                description.Append(Separator);
            }

            if (depth > MaxCauseDepth)
            {
                description.Append(DepthReached);
                break;
            }

            description.Append(current.GetType().Name).Append(": ").Append(current.Message);
        }

        return description.ToString();
    }
}
