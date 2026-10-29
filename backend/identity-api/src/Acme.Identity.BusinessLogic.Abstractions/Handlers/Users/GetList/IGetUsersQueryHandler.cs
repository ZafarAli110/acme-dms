using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.DTO.Users;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetList;

public interface IGetUsersQueryHandler
{
    Task<IReadOnlyList<DealerUserResponseDto>> ExecuteAsync(UserContext userContext, CancellationToken cancellationToken);
}
