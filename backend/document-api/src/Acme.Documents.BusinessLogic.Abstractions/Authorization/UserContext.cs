namespace Acme.Documents.BusinessLogic.Abstractions.Authorization;

/// <summary>Who is calling and for which dealer. Passed explicitly to every handler that touches dealer data.</summary>
public sealed record UserContext(Guid UserId, Guid DealerId, Guid? LocationId);
