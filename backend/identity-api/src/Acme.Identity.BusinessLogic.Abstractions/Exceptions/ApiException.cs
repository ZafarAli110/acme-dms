namespace Acme.Identity.BusinessLogic.Abstractions.Exceptions;

/// <summary>Thrown by handlers for expected failures. The service turns it into RFC 9457 problem details.</summary>
public sealed class ApiException : Exception
{
    public ApiException(ApiErrorCategory category, string message)
        : base(message)
    {
        Category = category;
    }

    /// <summary>An expected failure caused by another exception, kept as the cause so the log shows the whole chain.</summary>
    public ApiException(ApiErrorCategory category, string message, Exception innerException)
        : base(message, innerException)
    {
        Category = category;
    }

    /// <summary>Too many attempts: the client is told how long to wait (the <c>Retry-After</c> header).</summary>
    public ApiException(ApiErrorCategory category, string message, int retryAfterSeconds)
        : base(message)
    {
        Category = category;
        RetryAfterSeconds = retryAfterSeconds;
    }

    public ApiException()
    {
    }

    public ApiException(string message)
        : base(message)
    {
    }

    public ApiException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public ApiErrorCategory Category { get; } = ApiErrorCategory.BadRequest;

    /// <summary>How long the client should wait before trying again, when the failure is "too many attempts".</summary>
    public int? RetryAfterSeconds { get; }
}
