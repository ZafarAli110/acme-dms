using Acme.Identity.DTO.Users;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetCurrent;

public interface IGetCurrentUserQueryHandler
{
    Task<CurrentUserResponseDto> ExecuteAsync(Guid userId, CancellationToken cancellationToken);
}
