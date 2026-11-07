namespace Acme.Gateway.BusinessLogic.Abstractions.Clients;

/// <summary>identity-api could not be reached, or did not answer in time: signing in and renewing wait for it to come back.</summary>
public sealed class IdentityUnavailableException : Exception
{
    public IdentityUnavailableException()
    {
    }

    public IdentityUnavailableException(string message)
        : base(message)
    {
    }

    public IdentityUnavailableException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
