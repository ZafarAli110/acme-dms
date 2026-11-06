using Acme.Identity.DTO.Tokens;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens;

/// <summary>
/// What signing in or refreshing gives the controller: the body for the person, and the refresh token the controller puts
/// in the cookie. The refresh token never goes in a body. It is null when the person already holds the token that is
/// current (a refresh that raced another one): the cookie is left as it is.
/// </summary>
public sealed record IssuedTokens(TokenCreateResponseDto Response, string? RefreshToken);
