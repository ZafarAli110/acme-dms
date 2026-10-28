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
}
