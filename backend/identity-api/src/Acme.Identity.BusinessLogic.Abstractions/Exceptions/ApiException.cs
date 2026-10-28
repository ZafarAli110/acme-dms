namespace Acme.Identity.BusinessLogic.Abstractions.Exceptions;

/// <summary>Thrown by handlers for expected failures. The service turns it into RFC 9457 problem details.</summary>
public sealed class ApiException : Exception
{
    public ApiException(ApiErrorCategory category, string message)
        : base(message)
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
