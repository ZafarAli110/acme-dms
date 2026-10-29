using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.DTO.Users;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.AssignLocation;

public interface IAssignUserLocationCommandHandler
{
    Task<DealerUserResponseDto> ExecuteAsync(UserContext userContext, Guid userId, Guid locationId, CancellationToken cancellationToken);
}
