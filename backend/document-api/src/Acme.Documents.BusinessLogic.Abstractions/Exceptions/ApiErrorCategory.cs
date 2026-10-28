namespace Acme.Documents.BusinessLogic.Abstractions.Exceptions;

/// <summary>Expected failure categories a handler can raise. The value is the HTTP status code returned.</summary>
public enum ApiErrorCategory
{
    BadRequest = 400,
    Unauthorized = 401,
    Forbidden = 403,
    NotFound = 404,
    Conflict = 409,
}
